import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  productCategories,
  products,
  productSubCategories,
  units,
} from "@repo/database";
import { getDb } from "../db";
import { authMiddleware, requireOwner } from "../middleware/auth";
import type { AppVariables } from "../types";

export const productRoutes = new Hono<{ Variables: AppVariables }>();

productRoutes.use("*", authMiddleware);

productRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId");
  const db = getDb();

  const rows = await db
    .select({
      id: products.id,
      token: products.token,
      name: products.name,
      imageKey: products.imageKey,
      unitId: products.unitId,
      unitName: units.name,
      unitCode: units.code,
      unitType: units.type,
      unitIsBase: units.isBase,
      unitBaseUnitId: units.baseUnitId,
      unitConversionFactor: units.conversionFactor,
      currentPrice: products.currentPrice,
      status: products.status,
      categoryName: productCategories.name,
      subCategoryName: productSubCategories.name,
    })
    .from(products)
    .innerJoin(units, eq(products.unitId, units.id))
    .innerJoin(productSubCategories, eq(products.subCategoryId, productSubCategories.id))
    .innerJoin(productCategories, eq(productSubCategories.categoryId, productCategories.id))
    .where(and(eq(products.tenantId, tenantId), eq(products.status, "active")));

  // Get all units to build code map for baseUnitCode
  const allUnits = await db
    .select({ id: units.id, code: units.code })
    .from(units)
    .where(eq(units.tenantId, tenantId));
  const codeMap = Object.fromEntries(allUnits.map((u) => [u.id, u.code]));

  return c.json({
    products: rows.map((row) => ({
      id: row.id,
      token: row.token,
      name: row.name,
      imageKey: row.imageKey,
      currentPrice: row.currentPrice,
      status: row.status,
      categoryName: row.categoryName,
      subCategoryName: row.subCategoryName,
      unit: {
        id: row.unitId,
        name: row.unitName,
        code: row.unitCode,
        type: row.unitType,
        isBase: row.unitIsBase,
        baseUnitId: row.unitBaseUnitId,
        baseUnitCode: row.unitBaseUnitId ? (codeMap[row.unitBaseUnitId] ?? null) : null,
        conversionFactor: row.unitConversionFactor,
        isActive: true,
      },
    })),
  });
});

const bulkPriceSchema = z.object({
  prices: z.array(
    z.object({
      productId: z.string().uuid(),
      currentPrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
    }),
  ),
});

productRoutes.put("/prices", requireOwner, async (c) => {
  const tenantId = c.get("tenantId");
  const body = await c.req.json();
  const parsed = bulkPriceSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid price data" }, 400);
  }

  const db = getDb();

  for (const item of parsed.data.prices) {
    await db
      .update(products)
      .set({ currentPrice: item.currentPrice, updatedAt: new Date() })
      .where(and(eq(products.id, item.productId), eq(products.tenantId, tenantId)));
  }

  return c.json({ success: true });
});

const singlePriceSchema = z.object({
  currentPrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
});

productRoutes.put("/:id/price", requireOwner, async (c) => {
  const tenantId = c.get("tenantId");
  const productId = c.req.param("id");
  if (!productId) return c.json({ error: "Product ID required" }, 400);

  const body = await c.req.json();
  const parsed = singlePriceSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid price" }, 400);

  const db = getDb();
  const [updated] = await db
    .update(products)
    .set({ currentPrice: parsed.data.currentPrice, updatedAt: new Date() })
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)))
    .returning();

  if (!updated) return c.json({ error: "Product not found" }, 404);
  return c.json({ product: updated });
});
