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

// ─── Create / edit products ─────────────────────────────────────────────────

// A data URL keeps this working with zero extra infrastructure (no bucket,
// no credentials) — fine for a modest product catalogue. Capped well under
// Postgres's practical limits; the frontend compresses images before this
// point so real payloads are far smaller than the cap.
const imageKeySchema = z
  .string()
  .regex(/^data:image\/(png|jpeg|jpg|webp);base64,/, "Invalid image format")
  .max(2_000_000, "Image is too large");

const createProductSchema = z.object({
  subCategoryId: z.string().uuid("Choose a sub-category"),
  name: z.string().min(1, "Name is required"),
  token: z.string().min(1, "Token is required"),
  unitId: z.string().uuid("Choose a unit"),
  currentPrice: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid price"),
  isServiceItem: z.boolean().optional().default(false),
  // Extra units this product can also be sold in, besides its priced unit.
  sellableUnitIds: z.array(z.string().uuid()).optional().default([]),
  imageKey: imageKeySchema.optional().nullable(),
});

// POST /api/products — owner adds a new product to the catalogue
productRoutes.post("/", requireOwner, async (c) => {
  const tenantId = c.get("tenantId");
  const body = await c.req.json();
  const parsed = createProductSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid product data" }, 400);
  }

  const db = getDb();

  // Sub-category must belong to this tenant
  const [subCategory] = await db
    .select()
    .from(productSubCategories)
    .where(
      and(
        eq(productSubCategories.id, parsed.data.subCategoryId),
        eq(productSubCategories.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!subCategory) {
    return c.json({ error: "Sub-category not found" }, 404);
  }

  // Priced unit must belong to this tenant
  const [priceUnit] = await db
    .select()
    .from(units)
    .where(and(eq(units.id, parsed.data.unitId), eq(units.tenantId, tenantId)))
    .limit(1);

  if (!priceUnit) {
    return c.json({ error: "Unit not found" }, 404);
  }

  // Any extra sellable units must exist for this tenant and convert with the priced unit
  const extraUnitIds = parsed.data.sellableUnitIds.filter((id) => id !== priceUnit.id);
  let extraUnits: (typeof priceUnit)[] = [];
  if (extraUnitIds.length) {
    extraUnits = await db
      .select()
      .from(units)
      .where(and(eq(units.tenantId, tenantId), inArray(units.id, extraUnitIds)));

    if (extraUnits.length !== extraUnitIds.length) {
      return c.json({ error: "One or more sellable units not found" }, 400);
    }
    const mismatched = extraUnits.find((u) => !sameFamily(u, priceUnit));
    if (mismatched) {
      return c.json(
        { error: `"${mismatched.name}" doesn't convert with the priced unit "${priceUnit.name}"` },
        400,
      );
    }
  }

  let created;
  try {
    [created] = await db
      .insert(products)
      .values({
        tenantId,
        subCategoryId: parsed.data.subCategoryId,
        name: parsed.data.name,
        token: parsed.data.token,
        unitId: parsed.data.unitId,
        currentPrice: parsed.data.currentPrice,
        isServiceItem: parsed.data.isServiceItem,
        imageKey: parsed.data.imageKey ?? null,
        status: "active",
      })
      .returning();
  } catch {
    return c.json({ error: "A product with this token already exists" }, 409);
  }

  if (!created) {
    return c.json({ error: "Failed to create product" }, 500);
  }

  const allSellableIds = Array.from(new Set([priceUnit.id, ...extraUnitIds]));
  await db
    .insert(productUnits)
    .values(allSellableIds.map((unitId) => ({ tenantId, productId: created.id, unitId })));

  return c.json({ product: created }, 201);
});

const updateProductSchema = z.object({
  name: z.string().min(1).optional(),
  token: z.string().min(1).optional(),
  subCategoryId: z.string().uuid().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  imageKey: imageKeySchema.nullable().optional(),
});

// PATCH /api/products/:id — owner edits a product's name / token / sub-category / status
productRoutes.patch("/:id", requireOwner, async (c) => {
  const tenantId = c.get("tenantId");
  const productId = c.req.param("id");
  if (!productId) return c.json({ error: "Missing id" }, 400);

  const body = await c.req.json();
  const parsed = updateProductSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid product data" }, 400);
  }

  const db = getDb();

  if (parsed.data.subCategoryId) {
    const [subCategory] = await db
      .select()
      .from(productSubCategories)
      .where(
        and(
          eq(productSubCategories.id, parsed.data.subCategoryId),
          eq(productSubCategories.tenantId, tenantId),
        ),
      )
      .limit(1);
    if (!subCategory) return c.json({ error: "Sub-category not found" }, 404);
  }

  let updated;
  try {
    [updated] = await db
      .update(products)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)))
      .returning();
  } catch {
    return c.json({ error: "A product with this token already exists" }, 409);
  }

  if (!updated) return c.json({ error: "Product not found" }, 404);
  return c.json({ product: updated });
});

// PUT /api/products/:id/units — owner configures which units this product can be
// sold in (must all share the same type + base unit as the product's priced unit).
const setSellableUnitsSchema = z.object({
  unitIds: z.array(z.string().uuid()).min(1),
});

productRoutes.put("/:id/units", requireOwner, async (c) => {
  const tenantId = c.get("tenantId");
  const productId = c.req.param("id");
  if (!productId) {
    return c.json({ error: "Missing id" }, 400);
  }
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
