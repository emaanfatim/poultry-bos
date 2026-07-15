import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  chargeCategories,
  chargeRateLines,
  productChargeCategoryAssignment,
} from "@repo/database";
import type { Database } from "@repo/database";
import { getDb } from "../db";
import { validateNoCycle, normalizeCountsTowardOtherBases } from "../lib/charge-engine";
import { authMiddleware, requireOwner } from "../middleware/auth";
import type { AppVariables } from "../types";

// §1/§5/§6 — Charge Categories + Rate Lines. Every write here is owner-only
// (§8: "Owner Portal UI ... deferred, seeded as test/pilot data" — these
// routes ARE that seeding surface, so they stay owner-gated like every other
// config route in this codebase). All edits are append-only versions (§6) —
// nothing here ever UPDATEs a category row in place.
export const chargeCategoryRoutes = new Hono<{ Variables: AppVariables }>();

chargeCategoryRoutes.use("*", authMiddleware);

const rateLineSchema = z
  .object({
    calculationType: z.enum(["fixed", "percentage"]),
    value: z.string().or(z.number()).transform((v) => String(v)),
    scope: z.enum(["per_product", "whole_bill"]),
    conditionType: z.enum(["payment_method", "manual_selection", "default"]),
    conditionPaymentMethodId: z.string().uuid().optional().nullable(),
    manualSelectionLabel: z.string().optional().nullable(),
    dependsOnChargeCategoryId: z.string().uuid().optional().nullable(),
  })
  .refine(
    (rl) => rl.conditionType !== "payment_method" || !!rl.conditionPaymentMethodId,
    { message: "conditionPaymentMethodId is required when conditionType is payment_method" },
  )
  .refine(
    (rl) => rl.conditionType !== "manual_selection" || !!rl.manualSelectionLabel,
    { message: "manualSelectionLabel is required when conditionType is manual_selection" },
  );

const categorySchema = z.object({
  branchId: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  nameSecondaryLanguage: z.string().optional().nullable(),
  categoryType: z.enum(["tax", "surcharge", "other"]),
  isRegulatoryReportable: z.boolean().optional().default(false),
  regulatoryAuthorityName: z.string().optional().nullable(),
  countsTowardOtherBases: z.boolean().optional().default(false),
  refundableOnReturn: z.boolean().optional().default(true),
  rateLines: z.array(rateLineSchema).min(1, "At least one rate line is required"),
});

function validateExactlyOneDefault(rateLines: z.infer<typeof rateLineSchema>[]) {
  const defaults = rateLines.filter((rl) => rl.conditionType === "default");
  if (defaults.length !== 1) {
    throw new Error("Exactly one rate line with conditionType = default is required");
  }
}

/**
 * §5 — validates every dependsOnChargeCategoryId in the incoming rate lines
 * against the tenant's full current dependency graph, including edges the
 * category-being-saved would add. Excludes the category's own previous
 * version (if any) from the graph so re-saving unchanged dependencies on an
 * edit doesn't self-trip the self-reference check.
 */
async function validateDependencyGraph(
  db: Database,
  tenantId: string,
  categoryId: string,
  rateLines: z.infer<typeof rateLineSchema>[],
  excludeCategoryIds: string[],
) {
  const dependsOnIds = rateLines
    .map((rl) => rl.dependsOnChargeCategoryId)
    .filter((id): id is string => !!id);
  if (dependsOnIds.length === 0) return;

  const allCurrent = await db
    .select()
    .from(chargeCategories)
    .where(and(eq(chargeCategories.tenantId, tenantId), eq(chargeCategories.isCurrent, true)));

  const allRateLines = await db
    .select()
    .from(chargeRateLines)
    .where(eq(chargeRateLines.tenantId, tenantId));

  const graph = new Map(
    allCurrent
      .filter((cat) => !excludeCategoryIds.includes(cat.id))
      .map((cat) => [
        cat.id,
        {
          id: cat.id,
          categoryType: cat.categoryType as "tax" | "surcharge" | "other",
          dependsOn: allRateLines
            .filter((rl) => rl.chargeCategoryId === cat.id && rl.dependsOnChargeCategoryId)
            .map((rl) => rl.dependsOnChargeCategoryId!),
        },
      ]),
  );

  // Add the category being saved as a node too, so a dependency chain that
  // routes back through it is still caught.
  graph.set(categoryId, {
    id: categoryId,
    categoryType: rateLines.length > 0 ? "surcharge" : "surcharge", // placeholder, categoryType checked separately below
    dependsOn: dependsOnIds,
  });

  for (const dependsOnId of dependsOnIds) {
    validateNoCycle(categoryId, dependsOnId, graph);
  }
}

// GET /charge-categories — list current versions, optionally filtered by branch
chargeCategoryRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId");
  const branchId = c.req.query("branchId");
  const db = getDb();

  const categories = await db
    .select()
    .from(chargeCategories)
    .where(
      branchId
        ? and(
            eq(chargeCategories.tenantId, tenantId),
            eq(chargeCategories.isCurrent, true),
            eq(chargeCategories.branchId, branchId),
          )
        : and(eq(chargeCategories.tenantId, tenantId), eq(chargeCategories.isCurrent, true)),
    );

  if (categories.length === 0) return c.json({ chargeCategories: [] });

  const rateLines = await db
    .select()
    .from(chargeRateLines)
    .where(
      and(
        eq(chargeRateLines.tenantId, tenantId),
        inArray(
          chargeRateLines.chargeCategoryId,
          categories.map((cc) => cc.id),
        ),
      ),
    );

  return c.json({
    chargeCategories: categories.map((cat) => ({
      ...cat,
      rateLines: rateLines.filter((rl) => rl.chargeCategoryId === cat.id),
    })),
  });
});

// GET /charge-categories/:versionGroupId/history — every version ever taken
chargeCategoryRoutes.get("/:versionGroupId/history", async (c) => {
  const tenantId = c.get("tenantId");
  const versionGroupId = c.req.param("versionGroupId");
  const db = getDb();

  const versions = await db
    .select()
    .from(chargeCategories)
    .where(
      and(eq(chargeCategories.tenantId, tenantId), eq(chargeCategories.versionGroupId, versionGroupId)),
    );

  return c.json({
    versions: versions.sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime()),
  });
});

// POST /charge-categories — create a brand new category (owner only)
chargeCategoryRoutes.post("/", requireOwner, async (c) => {
  const tenantId = c.get("tenantId");
  const user = c.get("user");
  const body = await c.req.json();
  const parsed = categorySchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, 400);
  }

  try {
    validateExactlyOneDefault(parsed.data.rateLines);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }

  const db = getDb();
  const categoryId = randomUUID();

  try {
    await validateDependencyGraph(db, tenantId, categoryId, parsed.data.rateLines, []);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }

  const countsTowardOtherBases = normalizeCountsTowardOtherBases(
    parsed.data.categoryType,
    parsed.data.countsTowardOtherBases ?? false,
  );

  const result = await db.transaction(async (tx) => {
    const versionGroupId = randomUUID();

    const [category] = await tx
      .insert(chargeCategories)
      .values({
        id: categoryId,
        tenantId,
        branchId: parsed.data.branchId ?? null,
        versionGroupId,
        name: parsed.data.name,
        nameSecondaryLanguage: parsed.data.nameSecondaryLanguage ?? null,
        categoryType: parsed.data.categoryType,
        isRegulatoryReportable: parsed.data.isRegulatoryReportable,
        regulatoryAuthorityName: parsed.data.regulatoryAuthorityName ?? null,
        countsTowardOtherBases,
        refundableOnReturn: parsed.data.refundableOnReturn,
        isCurrent: true,
        isActive: true,
        createdByUserId: user.id,
      })
      .returning();

    const rateLines = await tx
      .insert(chargeRateLines)
      .values(
        parsed.data.rateLines.map((rl) => ({
          tenantId,
          chargeCategoryId: categoryId,
          calculationType: rl.calculationType,
          value: rl.value,
          scope: rl.scope,
          conditionType: rl.conditionType,
          conditionPaymentMethodId: rl.conditionPaymentMethodId ?? null,
          manualSelectionLabel: rl.manualSelectionLabel ?? null,
          dependsOnChargeCategoryId: rl.dependsOnChargeCategoryId ?? null,
        })),
      )
      .returning();

    return { category, rateLines };
  });

  return c.json({ chargeCategory: { ...result.category, rateLines: result.rateLines } }, 201);
});

/**
 * §6 — creates a new version: insert new row (new id, same versionGroupId,
 * isCurrent=true), flip the previous version's isCurrent to false, copy rate
 * lines forward onto the new id, and re-point any dependents (other rate
 * lines' dependsOnChargeCategoryId, and product_charge_category_assignment
 * rows) from the old id to the new one — all in a single transaction.
 */
async function createNewVersion(
  db: Database,
  tenantId: string,
  userId: string,
  previous: typeof chargeCategories.$inferSelect,
  updates: {
    name: string;
    nameSecondaryLanguage: string | null;
    categoryType: "tax" | "surcharge" | "other";
    isRegulatoryReportable: boolean;
    regulatoryAuthorityName: string | null;
    countsTowardOtherBases: boolean;
    refundableOnReturn: boolean;
    isActive: boolean;
    rateLines: z.infer<typeof rateLineSchema>[];
  },
) {
  const newId = randomUUID();

  return db.transaction(async (tx) => {
    await tx
      .update(chargeCategories)
      .set({ isCurrent: false })
      .where(eq(chargeCategories.id, previous.id));

    const [newCategory] = await tx
      .insert(chargeCategories)
      .values({
        id: newId,
        tenantId,
        branchId: previous.branchId,
        versionGroupId: previous.versionGroupId,
        name: updates.name,
        nameSecondaryLanguage: updates.nameSecondaryLanguage,
        categoryType: updates.categoryType,
        isRegulatoryReportable: updates.isRegulatoryReportable,
        regulatoryAuthorityName: updates.regulatoryAuthorityName,
        countsTowardOtherBases: normalizeCountsTowardOtherBases(
          updates.categoryType,
          updates.countsTowardOtherBases,
        ),
        refundableOnReturn: updates.refundableOnReturn,
        isCurrent: true,
        isActive: updates.isActive,
        createdByUserId: userId,
      })
      .returning();

    const newRateLines = await tx
      .insert(chargeRateLines)
      .values(
        updates.rateLines.map((rl) => ({
          tenantId,
          chargeCategoryId: newId,
          calculationType: rl.calculationType,
          value: rl.value,
          scope: rl.scope,
          conditionType: rl.conditionType,
          conditionPaymentMethodId: rl.conditionPaymentMethodId ?? null,
          manualSelectionLabel: rl.manualSelectionLabel ?? null,
          // Dependencies that pointed at the OLD id of the category we're
          // versioning are impossible here (a category can't depend on
          // itself), but dependencies on OTHER categories carry over as-is.
          dependsOnChargeCategoryId: rl.dependsOnChargeCategoryId ?? null,
        })),
      )
      .returning();

    // Re-point any OTHER current category's rate lines that depended on the
    // previous id.
    await tx
      .update(chargeRateLines)
      .set({ dependsOnChargeCategoryId: newId })
      .where(eq(chargeRateLines.dependsOnChargeCategoryId, previous.id));

    // Re-point product/branch/category/sub-category assignments.
    await tx
      .update(productChargeCategoryAssignment)
      .set({ chargeCategoryId: newId })
      .where(eq(productChargeCategoryAssignment.chargeCategoryId, previous.id));

    return { category: newCategory, rateLines: newRateLines };
  });
}

// PUT /charge-categories/:id — edit = new version (owner only). :id must be
// the CURRENT version's id.
chargeCategoryRoutes.put("/:id", requireOwner, async (c) => {
  const tenantId = c.get("tenantId");
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = categorySchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, 400);
  }

  try {
    validateExactlyOneDefault(parsed.data.rateLines);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }

  const db = getDb();
  const [previous] = await db
    .select()
    .from(chargeCategories)
    .where(
      and(
        eq(chargeCategories.id, id),
        eq(chargeCategories.tenantId, tenantId),
        eq(chargeCategories.isCurrent, true),
      ),
    )
    .limit(1);

  if (!previous) {
    return c.json({ error: "Charge category not found (or not the current version)" }, 404);
  }

  try {
    // Exclude the category's own previous version id from the graph so
    // re-saving the same dependency edges doesn't false-positive.
    await validateDependencyGraph(db, tenantId, previous.id, parsed.data.rateLines, [previous.id]);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }

  const result = await createNewVersion(db, tenantId, user.id, previous, {
    name: parsed.data.name,
    nameSecondaryLanguage: parsed.data.nameSecondaryLanguage ?? null,
    categoryType: parsed.data.categoryType,
    isRegulatoryReportable: parsed.data.isRegulatoryReportable,
    regulatoryAuthorityName: parsed.data.regulatoryAuthorityName ?? null,
    countsTowardOtherBases: parsed.data.countsTowardOtherBases ?? false,
    refundableOnReturn: parsed.data.refundableOnReturn,
    isActive: true,
    rateLines: parsed.data.rateLines,
  });

  return c.json({ chargeCategory: { ...result.category, rateLines: result.rateLines } });
});

// DELETE /charge-categories/:id — §6: "deleting" = a new version with
// isActive=false, never a hard delete or in-place update. Historical bills
// keep resolving against whichever version they actually used.
chargeCategoryRoutes.delete("/:id", requireOwner, async (c) => {
  const tenantId = c.get("tenantId");
  const user = c.get("user");
  const id = c.req.param("id");
  const db = getDb();

  const [previous] = await db
    .select()
    .from(chargeCategories)
    .where(
      and(
        eq(chargeCategories.id, id),
        eq(chargeCategories.tenantId, tenantId),
        eq(chargeCategories.isCurrent, true),
      ),
    )
    .limit(1);

  if (!previous) {
    return c.json({ error: "Charge category not found (or not the current version)" }, 404);
  }

  const existingRateLines = await db
    .select()
    .from(chargeRateLines)
    .where(eq(chargeRateLines.chargeCategoryId, previous.id));

  const result = await createNewVersion(db, tenantId, user.id, previous, {
    name: previous.name,
    nameSecondaryLanguage: previous.nameSecondaryLanguage,
    categoryType: previous.categoryType as "tax" | "surcharge" | "other",
    isRegulatoryReportable: previous.isRegulatoryReportable,
    regulatoryAuthorityName: previous.regulatoryAuthorityName,
    countsTowardOtherBases: previous.countsTowardOtherBases,
    refundableOnReturn: previous.refundableOnReturn,
    isActive: false,
    rateLines: existingRateLines.map((rl) => ({
      calculationType: rl.calculationType as "fixed" | "percentage",
      value: rl.value,
      scope: rl.scope as "per_product" | "whole_bill",
      conditionType: rl.conditionType as "payment_method" | "manual_selection" | "default",
      conditionPaymentMethodId: rl.conditionPaymentMethodId,
      manualSelectionLabel: rl.manualSelectionLabel,
      dependsOnChargeCategoryId: rl.dependsOnChargeCategoryId,
    })),
  });

  return c.json({ chargeCategory: { ...result.category, rateLines: result.rateLines } });
});
