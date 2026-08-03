import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { chargeCategories, productChargeCategoryAssignment } from "@repo/database";
import { getDb } from "../db";
import { authMiddleware, requireOwner } from "../middleware/auth";
import type { AppVariables } from "../types";

// §1 — assigns a Charge Category to one of the 4 inheritance levels (branch,
// product_category, product_sub_category, product). targetId is polymorphic
// by design (see schema comment) so there's no FK to validate against here
// beyond confirming the charge category itself belongs to this tenant.
export const chargeAssignmentRoutes = new Hono<{ Variables: AppVariables }>();

chargeAssignmentRoutes.use("*", authMiddleware);
chargeAssignmentRoutes.use("*", requireOwner);

// §1 (extended) — same-category, per-target rate override. overrideType
// 'override_rate' means "this category still applies here, but with this
// calculation type + value instead of its normal rate line(s)" — e.g. Tax
// is 15% everywhere except "Leg Piece", which gets its own value.
const assignmentSchema = z
  .object({
    chargeCategoryId: z.string().uuid(),
    assignmentLevel: z.enum(["branch", "product_category", "product_sub_category", "product"]),
    targetId: z.string().uuid(),
    overrideType: z
      .enum(["inherit", "override_on", "override_off", "override_rate"])
      .optional()
      .default("inherit"),
    rateOverrideCalculationType: z.enum(["fixed", "percentage"]).optional(),
    rateOverrideValue: z
      .union([z.string(), z.number()])
      .transform((v) => String(v))
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.overrideType === "override_rate") {
      if (!data.rateOverrideCalculationType) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "rateOverrideCalculationType is required when overrideType is override_rate",
          path: ["rateOverrideCalculationType"],
        });
      }
      if (data.rateOverrideValue === undefined || Number.isNaN(parseFloat(data.rateOverrideValue))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "rateOverrideValue is required when overrideType is override_rate",
          path: ["rateOverrideValue"],
        });
      }
    } else if (data.rateOverrideCalculationType !== undefined || data.rateOverrideValue !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "rateOverrideCalculationType/rateOverrideValue can only be set with overrideType = override_rate",
        path: ["overrideType"],
      });
    }
  });

// GET /charge-assignments?chargeCategoryId=... — list assignments for a category
chargeAssignmentRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId");
  const chargeCategoryId = c.req.query("chargeCategoryId");
  const targetId = c.req.query("targetId");
  const db = getDb();

  const conditions = [eq(productChargeCategoryAssignment.tenantId, tenantId)];
  if (chargeCategoryId) conditions.push(eq(productChargeCategoryAssignment.chargeCategoryId, chargeCategoryId));
  if (targetId) conditions.push(eq(productChargeCategoryAssignment.targetId, targetId));

  const rows = await db
    .select()
    .from(productChargeCategoryAssignment)
    .where(and(...conditions));

  return c.json({ assignments: rows });
});

// POST /charge-assignments — create or update (upsert on the unique
// chargeCategoryId+assignmentLevel+targetId index)
chargeAssignmentRoutes.post("/", async (c) => {
  const tenantId = c.get("tenantId");
  const body = await c.req.json();
  const parsed = assignmentSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, 400);
  }

  const db = getDb();

  const [category] = await db
    .select()
    .from(chargeCategories)
    .where(
      and(
        eq(chargeCategories.id, parsed.data.chargeCategoryId),
        eq(chargeCategories.tenantId, tenantId),
        eq(chargeCategories.isCurrent, true),
      ),
    )
    .limit(1);

  if (!category) {
    return c.json({ error: "Charge category not found (or not the current version)" }, 404);
  }

  const [existing] = await db
    .select()
    .from(productChargeCategoryAssignment)
    .where(
      and(
        eq(productChargeCategoryAssignment.tenantId, tenantId),
        eq(productChargeCategoryAssignment.chargeCategoryId, parsed.data.chargeCategoryId),
        eq(productChargeCategoryAssignment.assignmentLevel, parsed.data.assignmentLevel),
        eq(productChargeCategoryAssignment.targetId, parsed.data.targetId),
      ),
    )
    .limit(1);

  const rateOverrideCalculationType =
    parsed.data.overrideType === "override_rate"
      ? parsed.data.rateOverrideCalculationType ?? null
      : null;
  const rateOverrideValue =
    parsed.data.overrideType === "override_rate" ? parsed.data.rateOverrideValue ?? null : null;

  if (existing) {
    const [updated] = await db
      .update(productChargeCategoryAssignment)
      .set({
        overrideType: parsed.data.overrideType,
        rateOverrideCalculationType,
        rateOverrideValue,
      })
      .where(eq(productChargeCategoryAssignment.id, existing.id))
      .returning();
    return c.json({ assignment: updated });
  }

  const [created] = await db
    .insert(productChargeCategoryAssignment)
    .values({
      tenantId,
      chargeCategoryId: parsed.data.chargeCategoryId,
      assignmentLevel: parsed.data.assignmentLevel,
      targetId: parsed.data.targetId,
      overrideType: parsed.data.overrideType,
      rateOverrideCalculationType,
      rateOverrideValue,
    })
    .returning();

  return c.json({ assignment: created }, 201);
});

// DELETE /charge-assignments/:id — hard delete is fine here; assignment rows
// aren't referenced by any historical bill (transaction_charge_lines
// snapshots the resolved amount, not the assignment row that produced it).
chargeAssignmentRoutes.delete("/:id", async (c) => {
  const tenantId = c.get("tenantId");
  const id = c.req.param("id");
  const db = getDb();

  const [existing] = await db
    .select()
    .from(productChargeCategoryAssignment)
    .where(
      and(eq(productChargeCategoryAssignment.id, id), eq(productChargeCategoryAssignment.tenantId, tenantId)),
    )
    .limit(1);

  if (!existing) {
    return c.json({ error: "Assignment not found" }, 404);
  }

  await db
    .delete(productChargeCategoryAssignment)
    .where(eq(productChargeCategoryAssignment.id, id));

  return c.json({ success: true });
});
