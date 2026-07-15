import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { chargeRateLines, paymentMethods } from "@repo/database";
import { getDb } from "../db";
import { authMiddleware, requireOwner } from "../middleware/auth";
import type { AppVariables } from "../types";

// §2 — payment_methods as a real table (owner-defined name, requiresRounding
// driving the §4.1 rounding UI). Only owners manage the catalog; any
// authenticated user can list active methods for checkout.
export const paymentMethodRoutes = new Hono<{ Variables: AppVariables }>();

paymentMethodRoutes.use("*", authMiddleware);

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  requiresRounding: z.boolean().optional().default(false),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  requiresRounding: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

// GET /payment-methods — list (active-only unless includeInactive=1)
paymentMethodRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId");
  const includeInactive = c.req.query("includeInactive") === "1";
  const db = getDb();

  const rows = await db
    .select()
    .from(paymentMethods)
    .where(
      includeInactive
        ? eq(paymentMethods.tenantId, tenantId)
        : and(eq(paymentMethods.tenantId, tenantId), eq(paymentMethods.isActive, true)),
    );

  return c.json({ paymentMethods: rows });
});

// POST /payment-methods — create (owner only)
paymentMethodRoutes.post("/", requireOwner, async (c) => {
  const tenantId = c.get("tenantId");
  const body = await c.req.json();
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, 400);
  }

  const db = getDb();
  const [method] = await db
    .insert(paymentMethods)
    .values({
      tenantId,
      name: parsed.data.name,
      requiresRounding: parsed.data.requiresRounding,
    })
    .returning();

  return c.json({ paymentMethod: method }, 201);
});

// PUT /payment-methods/:id — update (owner only)
paymentMethodRoutes.put("/:id", requireOwner, async (c) => {
  const tenantId = c.get("tenantId");
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, 400);
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(paymentMethods)
    .where(and(eq(paymentMethods.id, id), eq(paymentMethods.tenantId, tenantId)))
    .limit(1);

  if (!existing) {
    return c.json({ error: "Payment method not found" }, 404);
  }

  const [updated] = await db
    .update(paymentMethods)
    .set(parsed.data)
    .where(and(eq(paymentMethods.id, id), eq(paymentMethods.tenantId, tenantId)))
    .returning();

  return c.json({ paymentMethod: updated });
});

// DELETE /payment-methods/:id — soft delete only (isActive=false). A hard
// delete would break the FK from charge_rate_lines.conditionPaymentMethodId
// on any historical rate line still referencing it.
paymentMethodRoutes.delete("/:id", requireOwner, async (c) => {
  const tenantId = c.get("tenantId");
  const id = c.req.param("id");
  const db = getDb();

  const [existing] = await db
    .select()
    .from(paymentMethods)
    .where(and(eq(paymentMethods.id, id), eq(paymentMethods.tenantId, tenantId)))
    .limit(1);

  if (!existing) {
    return c.json({ error: "Payment method not found" }, 404);
  }

  const inUse = await db
    .select({ id: chargeRateLines.id })
    .from(chargeRateLines)
    .where(eq(chargeRateLines.conditionPaymentMethodId, id))
    .limit(1);

  if (inUse.length > 0) {
    // Still allowed — just soft-delete so it disappears from new checkout
    // flows but keeps resolving correctly on any bill/rate-line that
    // already references it.
    const [updated] = await db
      .update(paymentMethods)
      .set({ isActive: false })
      .where(and(eq(paymentMethods.id, id), eq(paymentMethods.tenantId, tenantId)))
      .returning();
    return c.json({ paymentMethod: updated, note: "Soft-deleted; still referenced by charge rate lines" });
  }

  const [updated] = await db
    .update(paymentMethods)
    .set({ isActive: false })
    .where(and(eq(paymentMethods.id, id), eq(paymentMethods.tenantId, tenantId)))
    .returning();

  return c.json({ paymentMethod: updated });
});
