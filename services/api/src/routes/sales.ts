import { Hono } from "hono";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { z } from "zod";
import {
  products,
  transactionLineItems,
  transactions,
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
import { authMiddleware } from "../middleware/auth";
import type { AppVariables } from "../types";

export const salesRoutes = new Hono<{ Variables: AppVariables }>();

salesRoutes.use("*", authMiddleware);

const createSaleSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().positive(),
      }),
    )
    .min(1),
  paymentMethod: z.enum(["cash"]).optional().default("cash"),
});

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
    return c.json({ error: "Invalid sale data" }, 400);
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
    const [product] = await db
      .select()
      .from(products)
      .where(and(eq(products.id, item.productId), eq(products.tenantId, tenantId)))
      .limit(1);

    if (!product || product.status !== "active") {
      return c.json({ error: `Product not found: ${item.productId}` }, 400);
    }

    const lineTotal = multiplyLineTotal(item.quantity, product.currentPrice);
    subtotal += parseFloat(lineTotal);

    lineItems.push({
      productId: product.id,
      productName: product.name,
      unit: product.unit,
      quantity: roundQuantity(item.quantity),
      rate: product.currentPrice,
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
      subtotal: total,
      total,
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
      subtotal: transaction!.subtotal,
      total: transaction!.total,
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
      subtotal: transactions.subtotal,
      total: transactions.total,
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
