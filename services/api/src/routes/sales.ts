import { Hono } from "hono";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { z } from "zod";
import {
  branches,
  paymentMethods,
  productUnits,
  products,
  transactionChargeLines,
  transactionLineItems,
  transactions,
  units,
  users,
} from "@repo/database";
import { getDb } from "../db";
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
  resolveChargeCategoriesForProduct,
  toChargeCategoryLike,
  toChargeRateLineLike,
} from "./charge-resolution";
import { authMiddleware } from "../middleware/auth";
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
    // §4.1 — required only when the selected payment method's
    // requiresRounding = true; ignored otherwise.
    roundingMethod: z.enum(["exact", "round_up", "round_down", "custom"]).optional(),
    customAmount: z.number().optional(),
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

  // §7 — miscellaneous bills require a dedicated, per-staff permission, not
  // a role-wide one.
  if (parsed.data.billType === "miscellaneous" && !user.canCreateMiscellaneousBills) {
    return c.json({ error: "You don't have permission to create miscellaneous bills" }, 403);
  }

  const db = getDb();

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

  // §4.1 — the rounding UI only appears (and roundingMethod is only
  // required) when this payment method requires it.
  if (paymentMethod.requiresRounding && !parsed.data.roundingMethod) {
    return c.json({ error: "roundingMethod is required for this payment method" }, 400);
  }

  // ─── Steps 1-2: line-item subtotals, bill subtotal (§4) ─────────────────

  const lineItems: Array<{
    productId: string;
    productName: string;
    unit: string;
    quantity: string;
    rate: string;
    lineTotal: string;
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

    const lineTotal = multiplyLineTotal(item.quantity, rate);
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
      categoryId: context.categoryId,
      subCategoryId: context.subCategoryId,
    });
  }

  // ─── Step 3: discount (§4) ────────────────────────────────────────────────

  let discountAmount = 0;
  if (parsed.data.discount) {
    discountAmount =
      parsed.data.discount.type === "percentage"
        ? (subtotal * parsed.data.discount.value) / 100
        : parsed.data.discount.value;
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

    for (const { category, rateLines } of resolved) {
      const rateLine = selectApplicableRateLine(rateLines.map(toChargeRateLineLike), {
        paymentMethodId: parsed.data.paymentMethodId,
        manualSelectionLabel: parsed.data.manualSelections[category.id],
      });
      if (!rateLine) continue; // no default line configured — data problem, skip rather than crash checkout

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

    try {
      const result = applyRounding({
        trueTotal: calc.trueTotal,
        method: parsed.data.roundingMethod!,
        increment: parseFloat(branch.roundingIncrement ?? "1.00"),
        threshold: parseFloat(branch.roundingThreshold ?? "0.50"),
        customAmount: parsed.data.customAmount,
        hasCustomCashPermission: user.canApplyCustomRounding,
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
      discountType: parsed.data.discount?.type ?? null,
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
        lineTotal: line.lineTotal,
      })),
    )
    .returning();

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
      lineItems: insertedLines,
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

  return c.json({
    summary: {
      date: todayStart.toISOString().split("T")[0],
      totalRevenue: roundMoney(totalRevenue),
      transactionCount: todaySales.length,
      avgOrderValue: todaySales.length > 0 ? roundMoney(totalRevenue / todaySales.length) : "0.00",
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
      })),
      chargeLines,
    },
  });
});