import { Hono } from "hono";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { z } from "zod";
import {
  productUnits,
  products,
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
    paymentMethod: z.enum(["cash"]).optional().default("cash"),
    billType: z.enum(["priced", "unpriced"]).optional().default("priced"),
    customerName: z.string().max(100).optional(),
    customerPhone: z.string().max(20).optional(),
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

async function nextReceiptNumber(
  tenantId: string,
  branchToken: string,
): Promise<string> {
  const db = getDb();
  const dateKey = todayDateKey();
  const prefix = `${branchToken}-${dateKey}-`;

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
  const lineItems: Array<{
    productId: string;
    productName: string;
    unit: string;
    quantity: string;
    rate: string;
    lineTotal: string;
  }> = [];

  let subtotal = 0;

  for (const item of parsed.data.items) {
    const [row] = await db
      .select({
        id: products.id,
        name: products.name,
        currentPrice: products.currentPrice,
        status: products.status,
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

    lineItems.push({
      productId: row.id,
      productName: row.name,
      unit: sellUnit.code,
      quantity: roundQuantity(item.quantity),
      rate,
      lineTotal,
    });
  }

  const receiptNumber = await nextReceiptNumber(tenantId, branchToken);
  const total = roundMoney(subtotal);

  const [transaction] = await db
    .insert(transactions)
    .values({
      tenantId,
      branchId,
      receiptNumber,
      type: "sale",
      status: "completed",
      paymentMethod: parsed.data.paymentMethod,
      billType: parsed.data.billType,
      subtotal: total,
      total,
      customerName: parsed.data.customerName?.trim() || null,
      customerPhone: parsed.data.customerPhone?.trim() || null,
      createdBy: user.id,
    })
    .returning();

  await db.insert(transactionLineItems).values(
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
  );

  return c.json({
    transaction: {
      id: transaction!.id,
      receiptNumber: transaction!.receiptNumber,
      type: transaction!.type,
      status: transaction!.status,
      paymentMethod: transaction!.paymentMethod,
      billType: transaction!.billType,
      subtotal: transaction!.subtotal,
      total: transaction!.total,
      customerName: transaction!.customerName,
      customerPhone: transaction!.customerPhone,
      createdAt: transaction!.createdAt.toISOString(),
      createdByName: user.displayName,
      lineItems,
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
      paymentMethod: transactions.paymentMethod,
      billType: transactions.billType,
      subtotal: transactions.subtotal,
      total: transactions.total,
      customerName: transactions.customerName,
      customerPhone: transactions.customerPhone,
      createdAt: transactions.createdAt,
      createdByName: users.displayName,
    })
    .from(transactions)
    .innerJoin(users, eq(transactions.createdBy, users.id))
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
        lineTotal: line.lineTotal,
      })),
    },
  });
});
