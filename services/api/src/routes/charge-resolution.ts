// Resolves which Charge Categories apply to a given product, walking the
// 4-level inheritance chain from charges-tax-module-dev-handover.md §1:
// Branch → Product Category → Product Sub-category → Product.
//
// Resolution rule (the doc names the pattern but doesn't spell out the exact
// algorithm, so this is the concrete implementation): each level is checked
// in order from least to most specific. An `override_on` or `override_off`
// row at a level sets the category's applicability from that point forward;
// `inherit` (or no row at all at that level) carries the previous level's
// state forward unchanged. The most specific level with an explicit
// override always wins — e.g. a product-level `override_off` beats a
// category-level `override_on`, even though category is checked first.

import { Hono } from "hono";
import { and, eq, inArray } from "drizzle-orm";
import {
  chargeCategories,
  chargeRateLines,
  paymentMethods,
  productChargeCategoryAssignment,
  products,
} from "@repo/database";
import type { Database } from "@repo/database";
import { getDb } from "../db";
import {
  selectApplicableRateLine,
  type ChargeCategoryLike,
  type ChargeRateLineLike,
} from "../lib/charge-engine";
import { authMiddleware } from "../middleware/auth";
import type { AppVariables } from "../types";

type AssignmentLevel = "branch" | "product_category" | "product_sub_category" | "product";

const LEVEL_ORDER: AssignmentLevel[] = [
  "branch",
  "product_category",
  "product_sub_category",
  "product",
];

export interface ProductChargeContext {
  productId: string;
  categoryId: string; // product_categories.id
  subCategoryId: string; // product_sub_categories.id
  branchId: string;
}

export interface ResolvedCategoryForProduct {
  category: typeof chargeCategories.$inferSelect;
  rateLines: (typeof chargeRateLines.$inferSelect)[];
}

/**
 * Loads a product's category/sub-category ids, needed as inheritance
 * targets before resolving applicable charge categories.
 */
export async function loadProductChargeContext(
  db: Database,
  tenantId: string,
  branchId: string,
  productId: string,
): Promise<ProductChargeContext | null> {
  const [row] = await db
    .select({
      productId: products.id,
      subCategoryId: products.subCategoryId,
    })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)))
    .limit(1);

  if (!row) return null;

  // productSubCategories carries the parent categoryId — fetch it in the
  // same lib to keep the caller simple.
  const { productSubCategories } = await import("@repo/database");
  const [subCat] = await db
    .select({ categoryId: productSubCategories.categoryId })
    .from(productSubCategories)
    .where(eq(productSubCategories.id, row.subCategoryId))
    .limit(1);

  if (!subCat) return null;

  return {
    productId: row.productId,
    subCategoryId: row.subCategoryId,
    categoryId: subCat.categoryId,
    branchId,
  };
}

/**
 * Resolves the set of currently-active Charge Categories (with their rate
 * lines) that apply to a given product, for a given branch, honoring the
 * 4-level override chain described above. Only isActive/isCurrent category
 * versions are considered — this is for a live checkout, not historical
 * resolution (historical bills instead read their own stored
 * transaction_charge_lines rows, never recalculate against current data).
 */
export async function resolveChargeCategoriesForProduct(
  db: Database,
  tenantId: string,
  context: ProductChargeContext,
): Promise<ResolvedCategoryForProduct[]> {
  const targetIdsByLevel: Record<AssignmentLevel, string> = {
    branch: context.branchId,
    product_category: context.categoryId,
    product_sub_category: context.subCategoryId,
    product: context.productId,
  };

  const targetIds = Object.values(targetIdsByLevel);

  const assignments = await db
    .select()
    .from(productChargeCategoryAssignment)
    .where(
      and(
        eq(productChargeCategoryAssignment.tenantId, tenantId),
        inArray(productChargeCategoryAssignment.targetId, targetIds),
      ),
    );

  // Group assignment rows by chargeCategoryId, then walk least → most
  // specific to determine final applicability per category.
  const byCategory = new Map<string, (typeof assignments)[number][]>();
  for (const row of assignments) {
    // Guard against a targetId collision across levels (e.g. a branchId
    // that happens to equal some productId — practically impossible with
    // uuids, but keep resolution level-correct regardless).
    if (row.targetId !== targetIdsByLevel[row.assignmentLevel as AssignmentLevel]) continue;
    const list = byCategory.get(row.chargeCategoryId) ?? [];
    list.push(row);
    byCategory.set(row.chargeCategoryId, list);
  }

  const applicableCategoryIds: string[] = [];
  for (const [categoryId, rows] of byCategory) {
    let applies = false;
    for (const level of LEVEL_ORDER) {
      const row = rows.find((r) => r.assignmentLevel === level);
      if (!row) continue; // no explicit row at this level → inherit
      if (row.overrideType === "override_on") applies = true;
      else if (row.overrideType === "override_off") applies = false;
      // 'inherit' explicitly carries the previous state forward — no-op
    }
    if (applies) applicableCategoryIds.push(categoryId);
  }

  if (applicableCategoryIds.length === 0) return [];

  const categories = await db
    .select()
    .from(chargeCategories)
    .where(
      and(
        eq(chargeCategories.tenantId, tenantId),
        inArray(chargeCategories.id, applicableCategoryIds),
        eq(chargeCategories.isActive, true),
        eq(chargeCategories.isCurrent, true),
      ),
    );

  if (categories.length === 0) return [];

  const rateLines = await db
    .select()
    .from(chargeRateLines)
    .where(
      and(
        eq(chargeRateLines.tenantId, tenantId),
        inArray(
          chargeRateLines.chargeCategoryId,
          categories.map((c) => c.id),
        ),
      ),
    );

  return categories.map((category) => ({
    category,
    rateLines: rateLines.filter((rl) => rl.chargeCategoryId === category.id),
  }));
}

export function toChargeCategoryLike(
  category: typeof chargeCategories.$inferSelect,
): ChargeCategoryLike {
  return {
    id: category.id,
    categoryType: category.categoryType as ChargeCategoryLike["categoryType"],
    countsTowardOtherBases: category.countsTowardOtherBases,
    refundableOnReturn: category.refundableOnReturn,
    isActive: category.isActive,
  };
}

export function toChargeRateLineLike(
  rateLine: typeof chargeRateLines.$inferSelect,
): ChargeRateLineLike {
  return {
    id: rateLine.id,
    chargeCategoryId: rateLine.chargeCategoryId,
    calculationType: rateLine.calculationType as ChargeRateLineLike["calculationType"],
    value: rateLine.value,
    scope: rateLine.scope as ChargeRateLineLike["scope"],
    conditionType: rateLine.conditionType as ChargeRateLineLike["conditionType"],
    conditionPaymentMethodId: rateLine.conditionPaymentMethodId,
    manualSelectionLabel: rateLine.manualSelectionLabel,
    dependsOnChargeCategoryId: rateLine.dependsOnChargeCategoryId,
  };
}

// ─── Preview endpoint ───────────────────────────────────────────────────────
//
// GET /charge-resolution/product/:productId — lets the cashier UI show which
// Charge Categories (and their currently-applicable rate line) would apply
// to a product before it's added to the cart, without running a full
// checkout. Read-only: never persists anything, never itself decides which
// rate line "wins" for the final bill — sales.ts is still the only place
// that calls calculateCharges and writes transaction_charge_lines. Every
// cashier can hit this (it's informational, not a config write), unlike the
// charge-categories/charge-assignments routes which are owner-only.
export const chargeResolutionRoutes = new Hono<{ Variables: AppVariables }>();

chargeResolutionRoutes.use("*", authMiddleware);

chargeResolutionRoutes.get("/product/:productId", async (c) => {
  const tenantId = c.get("tenantId");
  const branchId = c.get("branchId");
  const productId = c.req.param("productId");
  const paymentMethodId = c.req.query("paymentMethodId");
  const db = getDb();

  const context = await loadProductChargeContext(db, tenantId, branchId, productId);
  if (!context) {
    return c.json({ error: "Product not found" }, 404);
  }

  const resolved = await resolveChargeCategoriesForProduct(db, tenantId, context);

  const activePaymentMethods = await db
    .select()
    .from(paymentMethods)
    .where(and(eq(paymentMethods.tenantId, tenantId), eq(paymentMethods.isActive, true)));
  const paymentMethodName = new Map(activePaymentMethods.map((pm) => [pm.id, pm.name]));

  return c.json({
    charges: resolved.map(({ category, rateLines }) => {
      const rateLineLikes = rateLines.map(toChargeRateLineLike);
      const applicable = selectApplicableRateLine(rateLineLikes, { paymentMethodId });
      return {
        category: {
          id: category.id,
          name: category.name,
          nameSecondaryLanguage: category.nameSecondaryLanguage,
          categoryType: category.categoryType,
          isRegulatoryReportable: category.isRegulatoryReportable,
        },
        // All configured rate lines, for a UI that wants to show the full
        // set of manual_selection options (e.g. "Small Box" / "Large Box").
        rateLines: rateLines.map((rl) => ({
          id: rl.id,
          calculationType: rl.calculationType,
          value: rl.value,
          scope: rl.scope,
          conditionType: rl.conditionType,
          conditionPaymentMethodName: rl.conditionPaymentMethodId
            ? paymentMethodName.get(rl.conditionPaymentMethodId) ?? null
            : null,
          manualSelectionLabel: rl.manualSelectionLabel,
        })),
        // The rate line that would actually apply right now, given the
        // optional ?paymentMethodId query param (no manual selection yet,
        // since the cashier hasn't picked one at preview time).
        applicableRateLineId: applicable?.id ?? null,
      };
    }),
  });
});
