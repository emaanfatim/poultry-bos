import { Hono } from "hono";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import {
  branches,
  cashierDiscountCategories,
  cashierDiscountProducts,
  modifierGroups,
  modifierOptions,
  paymentMethods,
  productModifierGroups,
  productSubCategories,
  productUnits,
  products,
  tillSessions,
  transactionChargeLines,
  transactionLineItems,
  transactionLineModifiers,
  transactions,
  units,
  users,
} from "@repo/database";
import { getDb } from "../db";
import type { Database } from "@repo/database";
import {
  endOfToday,
  multiplyLineTotal,
  roundMoney,
  roundQuantity,
  startOfToday,
  todayDateKey,
} from "../lib/money";
import { rateForUnit, sameFamily } from "../lib/units";
import {
  applyRounding,
  calculateCharges,
  selectApplicableRateLine,
  type CalculatedChargeLine,
  type ResolvedCharge,
  type RoundingMethod,
} from "../lib/charge-engine";
import {
  loadProductChargeContext,
  applyRateOverride,
  resolveChargeCategoriesForProduct,
  toChargeCategoryLike,
  toChargeRateLineLike,
} from "./charge-resolution";
import { authMiddleware } from "../middleware/auth";
import { syncLinkedGroupOptions } from "./modifier-groups";
import type { AppVariables } from "../types";

export const salesRoutes = new Hono<{ Variables: AppVariables }>();

salesRoutes.use("*", authMiddleware);

const createSaleSchema = z
  .object({
    items: z
      .array(
        z.object({
          productId: z.string().uuid(),
          quantity: z.number().positive(),
          // Which unit `quantity` is expressed in. Defaults to the product's priced unit.
          unitId: z.string().uuid().optional(),
          // Product-catalogue handover §3.1 — the cashier's modifier
          // picks for this line (Size, Milk, Shots, Packaging, ...). Only
          // the group/option IDs and chosen quantity are trusted from the
          // client; label/price are always re-resolved server-side below.
          modifiers: z
            .array(
              z.object({
                modifierGroupId: z.string().uuid(),
                modifierOptionId: z.string().uuid(),
                quantity: z.number().int().min(1).max(999).optional().default(1),
              }),
            )
            .optional()
            .default([]),
          // Free text, e.g. "no onions" — never priced, never shown on the
          // customer receipt, only on the kitchen/fulfillment ticket.
          kitchenNote: z.string().max(500).optional(),
        }),
      )
      .min(1),
    paymentMethodId: z.string().uuid(),
    billType: z.enum(["priced", "unpriced", "miscellaneous"]).optional().default("priced"),
    customerName: z.string().max(100).optional(),
    customerPhone: z.string().max(20).optional(),
    notes: z.string().max(500).optional(),
    // §4 step 3 — percentage or manual flat discount, applied to subtotal
    // before any charge category calculates.
    discount: z
      .object({
        type: z.enum(["percentage", "flat"]),
        value: z.number().min(0),
      })
      .optional(),
    // §1 — cashier's manual_selection pick per charge category, keyed by
    // chargeCategoryId (e.g. { "<packaging-category-id>": "Large Box" }).
    manualSelections: z.record(z.string().uuid(), z.string()).optional().default({}),
  })
  .refine(
    (data) =>
      data.billType !== "unpriced" ||
      (data.customerName?.trim() && data.customerPhone?.trim()),
    {
      message: "Customer name and phone are required for unpriced bills",
      path: ["customerName"],
    },
  );

/**
 * §7 — priced/unpriced share one B-prefixed counter (bill type is a field,
 * never encoded in the number); miscellaneous gets its own, never-shared
 * M-prefixed counter. Never returns a receipt number that collides across
 * the two sequences.
 */
async function nextReceiptNumber(
  tenantId: string,
  branchToken: string,
  billType: "priced" | "unpriced" | "miscellaneous",
): Promise<string> {
  const db = getDb();
  const dateKey = todayDateKey();
  const sequencePrefix = billType === "miscellaneous" ? "M" : "B";
  const prefix = `${sequencePrefix}${branchToken}-${dateKey}-`;

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(transactions)
    .where(
      and(
        eq(transactions.tenantId, tenantId),
        sql`${transactions.receiptNumber} LIKE ${prefix + "%"}`,
      ),
    );

  const sequence = String((result?.count ?? 0) + 1).padStart(4, "0");
  return `${prefix}${sequence}`;
}

/** Best-effort mapping onto the legacy free-text enum, kept populated
 * alongside paymentMethodId until the column is dropped (see schema note). */
function legacyPaymentMethodEnum(name: string): "cash" | "card" | "wallet" {
  const lower = name.toLowerCase();
  if (lower.includes("card")) return "card";
  if (lower.includes("cash")) return "cash";
  return "wallet";
}

type ModifierSelection = {
  modifierGroupId: string;
  modifierOptionId: string;
  label: string;
  quantity: number;
  unitCharge: string;
  totalCharge: string;
};

// Discriminated union keyed on the literal `ok` flag (not on `error`'s
// nullability) so TypeScript can actually narrow the return type at call
// sites. See: a union where one branch is `error: string` and the other is
// `error: null` is NOT a discriminated union to the type checker, because
// `string` isn't a literal type — narrowing on `error` alone silently
// fails and every property access afterward sees the full union.
type ModifierResolutionResult =
  | { ok: false; error: string }
  | { ok: true; modifierTotal: number; selections: ModifierSelection[] };

/**
 * Product-catalogue handover §3.1/§4 — validates a line's requested
 * modifier picks against the product's actually-attached groups and
 * re-prices every option from the DB (never trusts the client's price),
 * then checks every required group got a selection. Linked groups (e.g.
 * Packaging) are synced first so their price never drifts from the real
 * catalogue product. Returns { ok: false, error } on any mismatch.
 */
async function resolveLineModifiers(
  db: Database,
  tenantId: string,
  productId: string,
  productName: string,
  requested: Array<{ modifierGroupId: string; modifierOptionId: string; quantity: number }>,
): Promise<ModifierResolutionResult> {
  const attachments = await db
    .select()
    .from(productModifierGroups)
    .where(and(eq(productModifierGroups.tenantId, tenantId), eq(productModifierGroups.productId, productId)));

  if (attachments.length === 0) {
    if (requested.length > 0) {
      return { ok: false, error: `${productName} does not have any modifiers to select` };
    }
    return { ok: true, modifierTotal: 0, selections: [] };
  }

  const groupIds = attachments.map((a) => a.modifierGroupId);
  const groups = await db.select().from(modifierGroups).where(inArray(modifierGroups.id, groupIds));

  for (const group of groups) {
    if (group.linkedToSubCategoryId) {
      await syncLinkedGroupOptions(db, tenantId, group.id, group.linkedToSubCategoryId);
    }
  }

  const options = await db
    .select()
    .from(modifierOptions)
    .where(inArray(modifierOptions.modifierGroupId, groupIds));

  const groupById = new Map(groups.map((g) => [g.id, g]));
  const optionById = new Map(options.map((o) => [o.id, o]));
  const attachmentByGroupId = new Map(attachments.map((a) => [a.modifierGroupId, a]));

  // Group the cashier's requested picks by modifier group, so single/multi
  // selection-type and required-group rules can be checked per group.
  const requestedByGroup = new Map<string, typeof requested>();
  for (const pick of requested) {
    const group = groupById.get(pick.modifierGroupId);
    const attachment = attachmentByGroupId.get(pick.modifierGroupId);
    if (!group || !attachment) {
      return { ok: false, error: `${productName} does not offer that modifier group` };
    }
    const option = optionById.get(pick.modifierOptionId);
    if (!option || option.modifierGroupId !== pick.modifierGroupId) {
      return { ok: false, error: `Invalid option selected for ${group.name}` };
    }
    if (option.maxQuantity != null && pick.quantity > option.maxQuantity) {
      return { ok: false, error: `${option.label} allows at most ${option.maxQuantity}` };
    }
    const list = requestedByGroup.get(pick.modifierGroupId) ?? [];
    list.push(pick);
    requestedByGroup.set(pick.modifierGroupId, list);
  }

  for (const group of groups) {
    const attachment = attachmentByGroupId.get(group.id)!;
    const isRequired = attachment.isRequiredOverride ?? group.isRequired;
    const picks = requestedByGroup.get(group.id) ?? [];

    if (isRequired && picks.length === 0) {
      return { ok: false, error: `${group.name} is required for ${productName}` };
    }
    if (group.selectionType === "single" && picks.length > 1) {
      return { ok: false, error: `Only one option can be selected for ${group.name}` };
    }
  }

  let modifierTotal = 0;
  const selections: ModifierSelection[] = [];

  for (const pick of requested) {
    const group = groupById.get(pick.modifierGroupId)!;
    const option = optionById.get(pick.modifierOptionId)!;
    // modifier_charge = max(0, selectedQty - includedFreeQuantity) x
    // pricePerAdditionalUnit — covers flat-priced, priced-with-free-
    // allowance, and purely descriptive (isPriced=false / rate 0) options
    // with the same formula (schema note on transaction_line_modifiers).
    const billableQty = group.isPriced ? Math.max(0, pick.quantity - option.includedFreeQuantity) : 0;
    const unitCharge = group.isPriced ? option.pricePerAdditionalUnit : "0.00";
    const totalCharge = roundMoney(billableQty * parseFloat(unitCharge));
    modifierTotal += parseFloat(totalCharge);

    selections.push({
      modifierGroupId: group.id,
      modifierOptionId: option.id,
      label: `${group.name}: ${option.label}`,
      quantity: pick.quantity,
      unitCharge,
      totalCharge,
    });
  }

  return { ok: true, modifierTotal, selections };
}

salesRoutes.post("/", async (c) => {
  const tenantId = c.get("tenantId");
  const branchId = c.get("branchId");
  const branchToken = c.get("branchToken");
  const user = c.get("user");
  const body = await c.req.json();
  const parsed = createSaleSchema.safeParse(body);

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid sale data";
    return c.json({ error: message }, 400);
  }

  const db = getDb();

  // §7 — miscellaneous bills require a dedicated, per-staff permission, not
  // a role-wide one.
  if (parsed.data.billType === "miscellaneous" && !user.canCreateMiscellaneousBills) {
    return c.json({ error: "You don't have permission to create miscellaneous bills" }, 403);
  }

  // Till module — mandatory-till gate (scope-aware check happens below,
  // once the payment method is resolved and we know whether this is a
  // cash sale).
  const [tillGateUser] = await db
    .select({
      requiresTillToSell: users.requiresTillToSell,
      requiresTillToSellScope: users.requiresTillToSellScope,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  // Discount module — fast fail off the session claim first. The
  // authoritative check (fresh caps + product restriction, since an owner
  // may have just tightened this cashier's limits mid-shift) happens in
  // Step 3 below once the DB row is re-read.
  if (parsed.data.discount && !user.canApplyDiscount) {
    return c.json({ error: "You don't have permission to apply a discount" }, 403);
  }

  const [paymentMethod] = await db
    .select()
    .from(paymentMethods)
    .where(
      and(
        eq(paymentMethods.id, parsed.data.paymentMethodId),
        eq(paymentMethods.tenantId, tenantId),
        eq(paymentMethods.isActive, true),
      ),
    )
    .limit(1);

  if (!paymentMethod) {
    return c.json({ error: "Payment method not found or inactive" }, 400);
  }

  // Till module — mandatory-till gate, applied now that we know both the
  // bill type and whether this payment method is cash. "priced_cash_only"
  // scope only blocks the sale types that actually touch till math; a
  // stale JWT claim is never trusted here since the owner may have just
  // turned this on mid-shift.
  if (tillGateUser?.requiresTillToSell) {
    const isPricedCash =
      parsed.data.billType === "priced" && legacyPaymentMethodEnum(paymentMethod.name) === "cash";
    const gateApplies =
      tillGateUser.requiresTillToSellScope === "all_bills" ? true : isPricedCash;

    if (gateApplies) {
      const [openSession] = await db
        .select({ id: tillSessions.id })
        .from(tillSessions)
        .where(
          and(
            eq(tillSessions.tenantId, tenantId),
            eq(tillSessions.userId, user.id),
            eq(tillSessions.status, "open"),
          ),
        )
        .limit(1);

      if (!openSession) {
        return c.json(
          { error: "You must open your till before making sales", code: "TILL_NOT_OPEN" },
          403,
        );
      }
    }
  }

  // ─── Steps 1-2: line-item subtotals, bill subtotal (§4) ─────────────────

  const lineItems: Array<{
    productId: string;
    productName: string;
    unit: string;
    quantity: string;
    rate: string;
    lineTotal: string;
    modifierTotal: string;
    kitchenNote: string | null;
    modifierSelections: ModifierSelection[];
    categoryId: string;
    subCategoryId: string;
  }> = [];

  let subtotal = 0;

  for (const item of parsed.data.items) {
    const [row] = await db
      .select({
        id: products.id,
        name: products.name,
        currentPrice: products.currentPrice,
        status: products.status,
        subCategoryId: products.subCategoryId,
        priceUnit: units,
      })
      .from(products)
      .innerJoin(units, eq(products.unitId, units.id))
      .where(and(eq(products.id, item.productId), eq(products.tenantId, tenantId)))
      .limit(1);

    if (!row || row.status !== "active") {
      return c.json({ error: `Product not found: ${item.productId}` }, 400);
    }

    let sellUnit = row.priceUnit;
    let rate = row.currentPrice;

    if (item.unitId && item.unitId !== row.priceUnit.id) {
      const [sellable] = await db
        .select({ unit: units })
        .from(productUnits)
        .innerJoin(units, eq(productUnits.unitId, units.id))
        .where(
          and(
            eq(productUnits.tenantId, tenantId),
            eq(productUnits.productId, row.id),
            eq(units.id, item.unitId),
          ),
        )
        .limit(1);

      if (!sellable || !sellable.unit.isActive) {
        return c.json({ error: `Selected unit is not available for ${row.name}` }, 400);
      }
      if (!sameFamily(sellable.unit, row.priceUnit)) {
        return c.json(
          { error: `Selected unit doesn't convert with ${row.name}'s priced unit` },
          400,
        );
      }

      sellUnit = sellable.unit;
      rate = rateForUnit(row.currentPrice, row.priceUnit, sellUnit);
    }

    const baseLineTotal = multiplyLineTotal(item.quantity, rate);

    // Product-catalogue handover §3.1/§4 — resolve + re-price this line's
    // modifier picks against the product's actually-attached groups.
    // modifierTotal is a flat addition (not multiplied by quantity),
    // matching the schema note on transaction_line_items.modifierTotal.
    const modifierResult = await resolveLineModifiers(db, tenantId, row.id, row.name, item.modifiers);
    if (!modifierResult.ok) {
      return c.json({ error: modifierResult.error }, 400);
    }

    const lineTotal = roundMoney(parseFloat(baseLineTotal) + modifierResult.modifierTotal);
    subtotal += parseFloat(lineTotal);

    const context = await loadProductChargeContext(db, tenantId, branchId, row.id);
    if (!context) {
      return c.json({ error: `Could not resolve charge context for ${row.name}` }, 400);
    }

    lineItems.push({
      productId: row.id,
      productName: row.name,
      unit: sellUnit.code,
      quantity: roundQuantity(item.quantity),
      rate,
      lineTotal,
      modifierTotal: roundMoney(modifierResult.modifierTotal),
      kitchenNote: item.kitchenNote?.trim() || null,
      modifierSelections: modifierResult.selections,
      categoryId: context.categoryId,
      subCategoryId: context.subCategoryId,
    });
  }

  // ─── Step 3: discount (§4) ────────────────────────────────────────────────
  // Owner-configurable per-cashier: whether this cashier can discount at
  // all, independent caps for percentage vs flat (Rs), and an optional
  // restriction to specific products. Caps are re-read fresh from the DB
  // here (rather than trusted off the JWT) so a tightened limit takes
  // effect on the very next sale, not just after the cashier's next login.

  let discountAmount = 0;
  let discountType: "percentage" | "flat" | null = null;

  if (parsed.data.discount) {
    const { type, value } = parsed.data.discount;

    const [discountUser] = await db
      .select({
        canApplyDiscount: users.canApplyDiscount,
        maxDiscountPercentage: users.maxDiscountPercentage,
        maxDiscountFlatAmount: users.maxDiscountFlatAmount,
        discountRestrictedToProducts: users.discountRestrictedToProducts,
        discountRestrictedToCategories: users.discountRestrictedToCategories,
        discountBillTypeScope: users.discountBillTypeScope,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (!discountUser?.canApplyDiscount) {
      return c.json({ error: "You don't have permission to apply a discount" }, 403);
    }

    // Owner-configurable: whether this cashier's discount grant reaches
    // unpriced (credit/delivery-note) bills at all, or only priced ones.
    // Miscellaneous bills were never discount-eligible in the first place,
    // so this check only ever fires for "unpriced".
    if (
      discountUser.discountBillTypeScope === "priced_only" &&
      parsed.data.billType === "unpriced"
    ) {
      return c.json(
        { error: "You're not allowed to apply a discount on unpriced bills" },
        403,
      );
    }

    if (type === "percentage") {
      const cap = discountUser.maxDiscountPercentage
        ? parseFloat(discountUser.maxDiscountPercentage)
        : null;
      if (cap === null) {
        return c.json({ error: "You're not allowed to apply a percentage discount" }, 403);
      }
      if (value > cap) {
        return c.json({ error: `Maximum discount you can apply is ${cap}%` }, 403);
      }
    } else {
      const cap = discountUser.maxDiscountFlatAmount
        ? parseFloat(discountUser.maxDiscountFlatAmount)
        : null;
      if (cap === null) {
        return c.json({ error: "You're not allowed to apply a flat (Rs) discount" }, 403);
      }
      if (value > cap) {
        return c.json({ error: `Maximum discount you can apply is Rs ${cap}` }, 403);
      }
    }

    // Base the discount off the whole bill subtotal, unless this cashier is
    // restricted to specific products and/or specific categories — then
    // only the subtotal of the approved items in this cart is eligible
    // (a line item counts if it matches EITHER restriction, when both are
    // on). The rest of the cart still checks out fine; it just doesn't
    // receive any discount.
    let eligibleSubtotal = subtotal;
    if (discountUser.discountRestrictedToProducts || discountUser.discountRestrictedToCategories) {
      const allowedIds = new Set<string>();

      if (discountUser.discountRestrictedToProducts) {
        const allowedProducts = await db
          .select({ productId: cashierDiscountProducts.productId })
          .from(cashierDiscountProducts)
          .where(
            and(
              eq(cashierDiscountProducts.tenantId, tenantId),
              eq(cashierDiscountProducts.userId, user.id),
            ),
          );
        allowedProducts.forEach((row) => allowedIds.add(row.productId));
      }

      if (discountUser.discountRestrictedToCategories) {
        const allowedCategoryProducts = await db
          .select({ productId: products.id })
          .from(cashierDiscountCategories)
          .innerJoin(
            productSubCategories,
            eq(productSubCategories.categoryId, cashierDiscountCategories.categoryId),
          )
          .innerJoin(products, eq(products.subCategoryId, productSubCategories.id))
          .where(
            and(
              eq(cashierDiscountCategories.tenantId, tenantId),
              eq(cashierDiscountCategories.userId, user.id),
            ),
          );
        allowedCategoryProducts.forEach((row) => allowedIds.add(row.productId));
      }

      if (allowedIds.size === 0) {
        return c.json(
          { error: "You don't have any products or categories approved for discount" },
          403,
        );
      }

      eligibleSubtotal = lineItems
        .filter((line) => allowedIds.has(line.productId))
        .reduce((sum, line) => sum + parseFloat(line.lineTotal), 0);

      if (eligibleSubtotal <= 0) {
        return c.json(
          { error: "None of the items in this cart are approved for a discount" },
          400,
        );
      }
    }

    discountAmount =
      type === "percentage"
        ? (eligibleSubtotal * value) / 100
        : Math.min(value, eligibleSubtotal);
    discountType = type;
  }
  const discountedSubtotal = Math.max(0, subtotal - discountAmount);

  // ─── Steps 4-6: resolve + calculate charges (§1, §4, §5) ─────────────────
  // Per-product-scope charges apply once per line item they're assigned to.
  // Whole-bill-scope charges are deduped by category — they apply once to
  // the bill regardless of how many line items carry that category.

  const resolvedCharges: ResolvedCharge[] = [];
  const wholeBillSeen = new Map<string, ResolvedCharge>();
  const categoryNameById = new Map<string, string>();

  for (let i = 0; i < lineItems.length; i++) {
    const line = lineItems[i]!;
    const resolved = await resolveChargeCategoriesForProduct(db, tenantId, {
      productId: line.productId,
      categoryId: line.categoryId,
      subCategoryId: line.subCategoryId,
      branchId,
    });

    for (const { category, rateLines, rateOverride } of resolved) {
      const selected = selectApplicableRateLine(rateLines.map(toChargeRateLineLike), {
        paymentMethodId: parsed.data.paymentMethodId,
        manualSelectionLabel: parsed.data.manualSelections[category.id],
      });
      if (!selected) continue; // no default line configured — data problem, skip rather than crash checkout
      // A product/category/sub-category/branch-level rate override (owner
      // giving this specific target its own tax/charge value) replaces the
      // resolved line's value + calculationType only — payment-method /
      // manual-selection conditioning above is unaffected.
      const rateLine = applyRateOverride(selected, rateOverride);

      const categoryLike = toChargeCategoryLike(category);
      categoryNameById.set(category.id, category.name);

      if (rateLine.scope === "per_product") {
        resolvedCharges.push({
          category: categoryLike,
          rateLine,
          lineItemId: `idx:${i}`,
          lineItemBase: parseFloat(line.lineTotal),
        });
      } else if (!wholeBillSeen.has(category.id)) {
        wholeBillSeen.set(category.id, { category: categoryLike, rateLine });
      }
    }
  }

  for (const charge of wholeBillSeen.values()) resolvedCharges.push(charge);

  const calc = calculateCharges({
    discountedSubtotal,
    charges: resolvedCharges,
  });

  // ─── Step 7: rounding (§4.1) ──────────────────────────────────────────────

  let total = calc.trueTotal;
  let roundingAdjustment = 0;
  let roundingMethodStored: RoundingMethod | null = null;
  let roundingAppliedByUserId: string | null = null;

  if (paymentMethod.requiresRounding) {
    const [branch] = await db.select().from(branches).where(eq(branches.id, branchId)).limit(1);
    if (!branch) {
      return c.json({ error: "Branch not found" }, 400);
    }

    // Owner can override the rounding rule for a specific cashier (e.g.
    // Cashier A always rounds up, Cashier B always rounds down) even
    // though they use the same payment method. Re-read fresh from the DB
    // rather than trusting the JWT, same reasoning as the discount caps
    // above — a change takes effect on the very next sale.
    const [roundingUser] = await db
      .select({ roundingMethodOverride: users.roundingMethodOverride })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    const effectiveRoundingMethod = (roundingUser?.roundingMethodOverride ??
      paymentMethod.roundingMethod) as RoundingMethod;

    try {
      const result = applyRounding({
        trueTotal: calc.trueTotal,
        // Owner-decided — either this cashier's personal override, or
        // falling back to the payment method's own rule. Never a per-sale
        // cashier choice.
        method: effectiveRoundingMethod,
        increment: parseFloat(branch.roundingIncrement ?? "1.00"),
        threshold: parseFloat(branch.roundingThreshold ?? "0.50"),
        // hasCustomCashPermission gated the old cashier-facing Round Down /
        // Custom choice. The method is fixed by the owner now, so that
        // permission check no longer applies here.
        hasCustomCashPermission: true,
        customEntryMaxDeviation: branch.customEntryMaxDeviation
          ? parseFloat(branch.customEntryMaxDeviation)
          : null,
        customEntryStepMultiple: branch.customEntryStepMultiple
          ? parseFloat(branch.customEntryStepMultiple)
          : null,
      });
      total = result.total;
      roundingAdjustment = result.roundingAdjustment;
      roundingMethodStored = result.roundingMethod;
      roundingAppliedByUserId = user.id;
    } catch (e) {
      const message = (e as Error).message;
      const status = message.includes("permission") ? 403 : 400;
      return c.json({ error: message }, status);
    }
  }

  // ─── Step 8: persist ───────────────────────────────────────────────────────

  const receiptNumber = await nextReceiptNumber(tenantId, branchToken, parsed.data.billType);

  const [transaction] = await db
    .insert(transactions)
    .values({
      tenantId,
      branchId,
      receiptNumber,
      type: "sale",
      status: "completed",
      paymentMethod: legacyPaymentMethodEnum(paymentMethod.name),
      paymentMethodId: paymentMethod.id,
      billType: parsed.data.billType,
      subtotal: roundMoney(subtotal),
      discountType,
      discountAmount: roundMoney(discountAmount),
      trueTotal: roundMoney(calc.trueTotal),
      total: roundMoney(total),
      roundingAdjustment: roundMoney(roundingAdjustment),
      roundingMethod: roundingMethodStored,
      roundingAppliedByUserId,
      customerName: parsed.data.customerName?.trim() || null,
      customerPhone: parsed.data.customerPhone?.trim() || null,
      notes: parsed.data.notes?.trim() || null,
      createdBy: user.id,
    })
    .returning();

  const insertedLines = await db
    .insert(transactionLineItems)
    .values(
      lineItems.map((line) => ({
        tenantId,
        transactionId: transaction!.id,
        productId: line.productId,
        productName: line.productName,
        unit: line.unit,
        quantity: line.quantity,
        rate: line.rate,
        modifierTotal: line.modifierTotal,
        lineTotal: line.lineTotal,
        kitchenNote: line.kitchenNote,
      })),
    )
    .returning();

  // Product-catalogue handover §3.1 — persist each line's modifier picks
  // as their own snapshotted rows, so a kitchen ticket or historical
  // receipt never drifts if the modifier option is edited/deleted later.
  const modifierRowsToInsert = insertedLines.flatMap((insertedLine, i) =>
    (lineItems[i]?.modifierSelections ?? []).map((selection) => ({
      tenantId,
      transactionLineItemId: insertedLine.id,
      modifierGroupId: selection.modifierGroupId,
      modifierOptionId: selection.modifierOptionId,
      optionLabel: selection.label,
      quantity: selection.quantity,
      unitCharge: selection.unitCharge,
      totalCharge: selection.totalCharge,
    })),
  );
  if (modifierRowsToInsert.length > 0) {
    await db.insert(transactionLineModifiers).values(modifierRowsToInsert);
  }

  // Translate the synthetic `idx:N` placeholders used during charge
  // resolution into the real, DB-generated transaction_line_items ids.
  const lineIdByIndex = new Map(insertedLines.map((l, i) => [`idx:${i}`, l.id]));

  const allChargeLines: CalculatedChargeLine[] = [...calc.nonTaxLines, ...calc.taxLines];
  if (allChargeLines.length > 0) {
    await db.insert(transactionChargeLines).values(
      allChargeLines.map((line) => ({
        tenantId,
        transactionId: transaction!.id,
        transactionLineItemId: line.lineItemId ? lineIdByIndex.get(line.lineItemId) ?? null : null,
        chargeCategoryId: line.categoryId,
        chargeRateLineId: line.rateLineId,
        categoryName: categoryNameById.get(line.categoryId) ?? "",
        categoryType: line.categoryType,
        calculationType: line.calculationType,
        rateValue: line.rateValue,
        baseAmount: roundMoney(line.baseAmount),
        calculatedAmount: roundMoney(line.calculatedAmount),
        includedInOtherCategoryBase: line.includedInOtherCategoryBase,
      })),
    );
  }

  return c.json({
    transaction: {
      id: transaction!.id,
      receiptNumber: transaction!.receiptNumber,
      type: transaction!.type,
      status: transaction!.status,
      paymentMethodId: transaction!.paymentMethodId,
      paymentMethodName: paymentMethod.name,
      billType: transaction!.billType,
      subtotal: transaction!.subtotal,
      discountType: transaction!.discountType,
      discountAmount: transaction!.discountAmount,
      trueTotal: transaction!.trueTotal,
      total: transaction!.total,
      roundingAdjustment: transaction!.roundingAdjustment,
      roundingMethod: transaction!.roundingMethod,
      customerName: transaction!.customerName,
      customerPhone: transaction!.customerPhone,
      createdAt: transaction!.createdAt.toISOString(),
      createdByName: user.displayName,
      lineItems: insertedLines.map((line, i) => ({
        ...line,
        modifiers: lineItems[i]?.modifierSelections ?? [],
      })),
      chargeLines: allChargeLines,
    },
  });
});

salesRoutes.get("/daily-summary", async (c) => {
  const tenantId = c.get("tenantId");
  const branchId = c.get("branchId");
  const db = getDb();

  const todayStart = startOfToday();
  const todayEnd = endOfToday();

  const todaySales = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.tenantId, tenantId),
        eq(transactions.branchId, branchId),
        eq(transactions.type, "sale"),
        eq(transactions.status, "completed"),
        gte(transactions.createdAt, todayStart),
        lt(transactions.createdAt, todayEnd),
      ),
    );

  const totalRevenue = todaySales.reduce(
    (sum: number, sale: { total: string }) => sum + parseFloat(sale.total),
    0,
  );

  // Priced vs. unpriced (delivery-note) split — priced bills are real cash/
  // card sales rung up at the counter; unpriced ones are invoiced later and
  // never touch the till. "Miscellaneous" bills are a distinct third type
  // (special-permission bills, e.g. staff meals) and are intentionally left
  // out of this two-bucket breakdown rather than folded into "priced".
  const billTypeBreakdown = {
    priced: { count: 0, revenue: 0 },
    unpriced: { count: 0, revenue: 0 },
  };
  for (const sale of todaySales as Array<{ billType: string; total: string }>) {
    if (sale.billType !== "priced" && sale.billType !== "unpriced") continue;
    const bucket = billTypeBreakdown[sale.billType];
    bucket.count += 1;
    bucket.revenue += parseFloat(sale.total);
  }

  const breakdown = await db
    .select({
      productId: transactionLineItems.productId,
      productName: transactionLineItems.productName,
      unit: transactionLineItems.unit,
      totalQuantity: sql<string>`sum(${transactionLineItems.quantity})`,
      totalRevenue: sql<string>`sum(${transactionLineItems.lineTotal})`,
    })
    .from(transactionLineItems)
    .innerJoin(transactions, eq(transactionLineItems.transactionId, transactions.id))
    .where(
      and(
        eq(transactions.tenantId, tenantId),
        eq(transactions.branchId, branchId),
        eq(transactions.type, "sale"),
        eq(transactions.status, "completed"),
        gte(transactions.createdAt, todayStart),
        lt(transactions.createdAt, todayEnd),
      ),
    )
    .groupBy(
      transactionLineItems.productId,
      transactionLineItems.productName,
      transactionLineItems.unit,
    );

  // Per-transaction modifier picks — e.g. Receipt B...-0007 had "Skin: Skin"
  // and "Size: Medium". Shown as a column on the transaction row rather
  // than a separate aggregate table, so the cashier/owner can see exactly
  // which modifiers were on which sale. Joined through
  // transactionLineItems (not the transaction line modifier's own
  // transactionLineItemId FK directly) so we can filter on the same
  // tenant/branch/date window as everything else above.
  const todayTransactionIds = todaySales.map((sale) => sale.id);
  const modifierRows = todayTransactionIds.length
    ? await db
        .select({
          transactionId: transactionLineItems.transactionId,
          optionLabel: transactionLineModifiers.optionLabel,
          quantity: transactionLineModifiers.quantity,
          totalCharge: transactionLineModifiers.totalCharge,
        })
        .from(transactionLineModifiers)
        .innerJoin(
          transactionLineItems,
          eq(transactionLineModifiers.transactionLineItemId, transactionLineItems.id),
        )
        .where(
          and(
            eq(transactionLineModifiers.tenantId, tenantId),
            inArray(transactionLineItems.transactionId, todayTransactionIds),
          ),
        )
    : [];

  const modifiersByTransactionId = new Map<
    string,
    Array<{ label: string; quantity: number; totalCharge: string }>
  >();
  for (const row of modifierRows) {
    const list = modifiersByTransactionId.get(row.transactionId) ?? [];
    list.push({ label: row.optionLabel, quantity: row.quantity, totalCharge: row.totalCharge });
    modifiersByTransactionId.set(row.transactionId, list);
  }

  const summaryDateKey = todayDateKey();
  return c.json({
    summary: {
      date: `${summaryDateKey.slice(0, 4)}-${summaryDateKey.slice(4, 6)}-${summaryDateKey.slice(6, 8)}`,
      totalRevenue: roundMoney(totalRevenue),
      transactionCount: todaySales.length,
      avgOrderValue: todaySales.length > 0 ? roundMoney(totalRevenue / todaySales.length) : "0.00",
      billTypeBreakdown: {
        priced: {
          count: billTypeBreakdown.priced.count,
          revenue: roundMoney(billTypeBreakdown.priced.revenue),
        },
        unpriced: {
          count: billTypeBreakdown.unpriced.count,
          revenue: roundMoney(billTypeBreakdown.unpriced.revenue),
        },
      },
      productBreakdown: breakdown.map((row: {
        productId: string;
        productName: string;
        unit: string;
        totalQuantity: string;
        totalRevenue: string;
      }) => ({
        productId: row.productId,
        productName: row.productName,
        totalQuantity: parseFloat(row.totalQuantity).toFixed(3),
        unit: row.unit,
        totalRevenue: parseFloat(row.totalRevenue).toFixed(2),
      })),
      transactions: todaySales
        .slice()
        .sort(
          (a: { createdAt: Date }, b: { createdAt: Date }) =>
            b.createdAt.getTime() - a.createdAt.getTime(),
        )
        .map((sale: typeof todaySales[number]) => ({
          id: sale.id,
          receiptNumber: sale.receiptNumber,
          billType: sale.billType,
          subtotal: sale.subtotal,
          discountType: sale.discountType,
          discountAmount: sale.discountAmount,
          roundingAdjustment: sale.roundingAdjustment,
          total: sale.total,
          customerName: sale.customerName,
          customerPhone: sale.customerPhone,
          createdAt: sale.createdAt.toISOString(),
          modifiers: modifiersByTransactionId.get(sale.id) ?? [],
        })),
    },
  });
});


salesRoutes.get("/:id", async (c) => {
  const tenantId = c.get("tenantId");
  const transactionId = c.req.param("id");
  const db = getDb();

  const [transaction] = await db
    .select({
      id: transactions.id,
      receiptNumber: transactions.receiptNumber,
      type: transactions.type,
      status: transactions.status,
      paymentMethodId: transactions.paymentMethodId,
      paymentMethodName: paymentMethods.name,
      billType: transactions.billType,
      subtotal: transactions.subtotal,
      discountType: transactions.discountType,
      discountAmount: transactions.discountAmount,
      trueTotal: transactions.trueTotal,
      total: transactions.total,
      roundingAdjustment: transactions.roundingAdjustment,
      roundingMethod: transactions.roundingMethod,
      customerName: transactions.customerName,
      customerPhone: transactions.customerPhone,
      createdAt: transactions.createdAt,
      createdByName: users.displayName,
    })
    .from(transactions)
    .innerJoin(users, eq(transactions.createdBy, users.id))
    .leftJoin(paymentMethods, eq(transactions.paymentMethodId, paymentMethods.id))
    .where(and(eq(transactions.id, transactionId), eq(transactions.tenantId, tenantId)))
    .limit(1);

  if (!transaction) {
    return c.json({ error: "Transaction not found" }, 404);
  }

  const lineItems = await db
    .select()
    .from(transactionLineItems)
    .where(
      and(
        eq(transactionLineItems.transactionId, transactionId),
        eq(transactionLineItems.tenantId, tenantId),
      ),
    );

  const chargeLines = await db
    .select()
    .from(transactionChargeLines)
    .where(
      and(
        eq(transactionChargeLines.transactionId, transactionId),
        eq(transactionChargeLines.tenantId, tenantId),
      ),
    );

  const lineItemIds = lineItems.map((l) => l.id);
  const modifierRows = lineItemIds.length
    ? await db
        .select()
        .from(transactionLineModifiers)
        .where(
          and(
            eq(transactionLineModifiers.tenantId, tenantId),
            inArray(transactionLineModifiers.transactionLineItemId, lineItemIds),
          ),
        )
    : [];

  return c.json({
    transaction: {
      ...transaction,
      createdAt: transaction.createdAt.toISOString(),
      lineItems: lineItems.map((line: (typeof lineItems)[number]) => ({
        id: line.id,
        productId: line.productId,
        productName: line.productName,
        unit: line.unit,
        quantity: line.quantity,
        rate: line.rate,
        modifierTotal: line.modifierTotal,
        lineTotal: line.lineTotal,
        kitchenNote: line.kitchenNote,
        modifiers: modifierRows
          .filter((m) => m.transactionLineItemId === line.id)
          .map((m) => ({
            modifierGroupId: m.modifierGroupId,
            modifierOptionId: m.modifierOptionId,
            label: m.optionLabel,
            quantity: m.quantity,
            unitCharge: m.unitCharge,
            totalCharge: m.totalCharge,
          })),
      })),
      chargeLines,
    },
  });
});