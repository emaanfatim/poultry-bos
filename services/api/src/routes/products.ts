import { Hono } from "hono";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  productCategories,
  productSubCategories,
  productUnits,
  products,
  units,
} from "@repo/database";
import { getDb } from "../db";
import { authMiddleware, requireOwner } from "../middleware/auth";
import { sameFamily } from "../lib/units";
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

  const allUnits = await db.select().from(units).where(eq(units.tenantId, tenantId));
  const codeMap = Object.fromEntries(allUnits.map((u) => [u.id, u.code]));
  const unitById = new Map(allUnits.map((u) => [u.id, u]));

  const productIds = rows.map((r) => r.id);
  const sellableRows = productIds.length
    ? await db
        .select({ productId: productUnits.productId, unitId: productUnits.unitId })
        .from(productUnits)
        .where(
          and(eq(productUnits.tenantId, tenantId), inArray(productUnits.productId, productIds)),
        )
    : [];

  const toUnitDto = (u: (typeof allUnits)[number]) => ({
    id: u.id,
    name: u.name,
    code: u.code,
    type: u.type,
    isBase: u.isBase,
    baseUnitId: u.baseUnitId,
    baseUnitCode: u.baseUnitId ? (codeMap[u.baseUnitId] ?? null) : null,
    conversionFactor: u.conversionFactor,
    isActive: u.isActive,
  });

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
      units: sellableRows
        .filter((su) => su.productId === row.id)
        .map((su) => unitById.get(su.unitId))
        .filter((u): u is (typeof allUnits)[number] => Boolean(u))
        .map(toUnitDto),
    })),
  });
});

// PUT /api/products/:id/units — owner configures which units this product can be
// sold in (must all share the same type + base unit as the product's priced unit).
const setSellableUnitsSchema = z.object({
  unitIds: z.array(z.string().uuid()).min(1),
});

productRoutes.put("/:id/units", requireOwner, async (c) => {
  const tenantId = c.get("tenantId");
  const productId = c.req.param("id");
  const body = await c.req.json();
  const parsed = setSellableUnitsSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid unit data" }, 400);
  }

  const db = getDb();

  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)))
    .limit(1);

  if (!product) {
    return c.json({ error: "Product not found" }, 404);
  }

  const [priceUnit] = await db
    .select()
    .from(units)
    .where(and(eq(units.id, product.unitId), eq(units.tenantId, tenantId)))
    .limit(1);

  if (!priceUnit) {
    return c.json({ error: "Product's priced unit is missing" }, 400);
  }

  const allIds = Array.from(new Set([priceUnit.id, ...parsed.data.unitIds]));
  const unitRows = await db
    .select()
    .from(units)
    .where(and(eq(units.tenantId, tenantId), inArray(units.id, allIds)));

  if (unitRows.length !== allIds.length) {
    return c.json({ error: "One or more units not found" }, 400);
  }

  const mismatched = unitRows.find((u) => !sameFamily(u, priceUnit));
  if (mismatched) {
    return c.json(
      { error: `"${mismatched.name}" doesn't convert with this product's priced unit "${priceUnit.name}"` },
      400,
    );
  }

  await db
    .delete(productUnits)
    .where(and(eq(productUnits.tenantId, tenantId), eq(productUnits.productId, productId)));

  await db.insert(productUnits).values(allIds.map((unitId) => ({ tenantId, productId, unitId })));

  return c.json({ success: true, unitIds: allIds });
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
