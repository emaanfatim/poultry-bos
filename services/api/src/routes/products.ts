import { Hono } from "hono";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  modifierGroups,
  modifierOptions,
  productCategories,
  productModifierGroups,
  productSubCategories,
  productUnits,
  products,
  units,
} from "@repo/database";
import { getDb } from "../db";
import { authMiddleware, requireOwner } from "../middleware/auth";
import { sameFamily } from "../lib/units";
import { syncLinkedGroupOptions } from "./modifier-groups";
import type { AppVariables } from "../types";

export const productRoutes = new Hono<{ Variables: AppVariables }>();

productRoutes.use("*", authMiddleware);

productRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId");
  const branchId = c.get("branchId");
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
    .where(
      and(
        eq(products.tenantId, tenantId),
        eq(products.branchId, branchId),
        eq(products.status, "active"),
      ),
    );

  const allUnits = await db
    .select()
    .from(units)
    .where(and(eq(units.tenantId, tenantId), eq(units.branchId, branchId)));
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

  // Catalogue style (§2 of the handover) — a product "uses Modifiers" simply
  // by having at least one active modifier group attached; there's no
  // separate style flag to keep in sync, so this stays derived rather than
  // stored.
  const attachedGroupRows = productIds.length
    ? await db
        .select({
          productId: productModifierGroups.productId,
          isActive: modifierGroups.isActive,
        })
        .from(productModifierGroups)
        .innerJoin(modifierGroups, eq(productModifierGroups.modifierGroupId, modifierGroups.id))
        .where(
          and(
            eq(productModifierGroups.tenantId, tenantId),
            inArray(productModifierGroups.productId, productIds),
          ),
        )
    : [];
  const modifierCountByProduct = new Map<string, number>();
  for (const row of attachedGroupRows) {
    if (!row.isActive) continue;
    modifierCountByProduct.set(row.productId, (modifierCountByProduct.get(row.productId) ?? 0) + 1);
  }

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
      hasModifiers: (modifierCountByProduct.get(row.id) ?? 0) > 0,
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
  const branchId = c.get("branchId");
  const body = await c.req.json();
  const parsed = createProductSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid product data" }, 400);
  }

  const db = getDb();

  // Sub-category must belong to this tenant + branch
  const [subCategory] = await db
    .select()
    .from(productSubCategories)
    .where(
      and(
        eq(productSubCategories.id, parsed.data.subCategoryId),
        eq(productSubCategories.tenantId, tenantId),
        eq(productSubCategories.branchId, branchId),
      ),
    )
    .limit(1);

  if (!subCategory) {
    return c.json({ error: "Sub-category not found" }, 404);
  }

  // Priced unit must belong to this tenant + branch
  const [priceUnit] = await db
    .select()
    .from(units)
    .where(
      and(eq(units.id, parsed.data.unitId), eq(units.tenantId, tenantId), eq(units.branchId, branchId)),
    )
    .limit(1);

  if (!priceUnit) {
    return c.json({ error: "Unit not found" }, 404);
  }

  // Any extra sellable units must exist for this tenant + branch and convert with the priced unit
  const extraUnitIds = parsed.data.sellableUnitIds.filter((id) => id !== priceUnit.id);
  let extraUnits: (typeof priceUnit)[] = [];
  if (extraUnitIds.length) {
    extraUnits = await db
      .select()
      .from(units)
      .where(
        and(
          eq(units.tenantId, tenantId),
          eq(units.branchId, branchId),
          inArray(units.id, extraUnitIds),
        ),
      );

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
        branchId,
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
  const branchId = c.get("branchId");
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
          eq(productSubCategories.branchId, branchId),
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
      .where(and(eq(products.id, productId), eq(products.tenantId, tenantId), eq(products.branchId, branchId)))
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
  const branchId = c.get("branchId");
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
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId), eq(products.branchId, branchId)))
    .limit(1);

  if (!product) {
    return c.json({ error: "Product not found" }, 404);
  }

  const [priceUnit] = await db
    .select()
    .from(units)
    .where(and(eq(units.id, product.unitId), eq(units.tenantId, tenantId), eq(units.branchId, branchId)))
    .limit(1);

  if (!priceUnit) {
    return c.json({ error: "Product's priced unit is missing" }, 400);
  }

  const allIds = Array.from(new Set([priceUnit.id, ...parsed.data.unitIds]));
  const unitRows = await db
    .select()
    .from(units)
    .where(and(eq(units.tenantId, tenantId), eq(units.branchId, branchId), inArray(units.id, allIds)));

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
  const branchId = c.get("branchId");
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
      .where(
        and(
          eq(products.id, item.productId),
          eq(products.tenantId, tenantId),
          eq(products.branchId, branchId),
        ),
      );
  }

  return c.json({ success: true });
});

const singlePriceSchema = z.object({
  currentPrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
});

productRoutes.put("/:id/price", requireOwner, async (c) => {
  const tenantId = c.get("tenantId");
  const branchId = c.get("branchId");
  const productId = c.req.param("id");
  if (!productId) return c.json({ error: "Product ID required" }, 400);

  const body = await c.req.json();
  const parsed = singlePriceSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid price" }, 400);

  const db = getDb();
  const [updated] = await db
    .update(products)
    .set({ currentPrice: parsed.data.currentPrice, updatedAt: new Date() })
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId), eq(products.branchId, branchId)))
    .returning();

  if (!updated) return c.json({ error: "Product not found" }, 404);
  return c.json({ product: updated });
});

// ─── Product catalogue style: attaching Modifier Groups (handover §2/§3) ───
// A product stays "Simple" until at least one group is attached here; there
// is nothing else to flip — attaching/detaching groups IS the style switch.

// GET /products/:id/modifier-groups — groups currently attached to this
// product, each with its live-resolved options. Used both by the Owner
// Portal's product edit screen AND the Counter App's POS (a cashier needs
// to see a product's Size/Milk/Shots choices to sell it at all), so this
// stays read-only-for-any-authenticated-user rather than owner-gated.
// Only the PUT below (which changes what's attached) is owner-only.
productRoutes.get("/:id/modifier-groups", async (c) => {
  const tenantId = c.get("tenantId");
  const branchId = c.get("branchId");
  const productId = c.req.param("id");
  if (!productId) return c.json({ error: "Missing id" }, 400);
  const db = getDb();

  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId), eq(products.branchId, branchId)))
    .limit(1);
  if (!product) return c.json({ error: "Product not found" }, 404);

  const attachments = await db
    .select()
    .from(productModifierGroups)
    .where(and(eq(productModifierGroups.tenantId, tenantId), eq(productModifierGroups.productId, productId)))
    .orderBy(productModifierGroups.sortOrder);

  const groupIds = attachments.map((a) => a.modifierGroupId);
  const groups = groupIds.length
    ? await db.select().from(modifierGroups).where(inArray(modifierGroups.id, groupIds))
    : [];

  // Keep any Linked Group (e.g. Packaging) in step with its sub-category
  // before returning options — otherwise a cashier at POS could see a
  // price that's already drifted from the real catalogue.
  for (const group of groups) {
    if (group.linkedToSubCategoryId) {
      await syncLinkedGroupOptions(db, tenantId, group.id, group.linkedToSubCategoryId);
    }
  }

  const options = groupIds.length
    ? await db
        .select()
        .from(modifierOptions)
        .where(inArray(modifierOptions.modifierGroupId, groupIds))
        .orderBy(modifierOptions.sortOrder)
    : [];
  const groupById = new Map(groups.map((g) => [g.id, g]));

  return c.json({
    modifierGroups: attachments
      .map((a) => {
        const group = groupById.get(a.modifierGroupId);
        if (!group) return null;
        return {
          ...group,
          isRequired: a.isRequiredOverride ?? group.isRequired,
          sortOrder: a.sortOrder,
          options: options.filter((o) => o.modifierGroupId === group.id),
        };
      })
      .filter((g): g is NonNullable<typeof g> => g !== null),
  });
});

const setProductModifierGroupsSchema = z.object({
  modifierGroups: z.array(
    z.object({
      modifierGroupId: z.string().uuid(),
      isRequiredOverride: z.boolean().nullable().optional(),
      sortOrder: z.number().int().optional().default(0),
    }),
  ),
});

// PUT /products/:id/modifier-groups — replace the full set of groups
// attached to this product. Sending an empty array switches the product
// back to "Simple" style.
productRoutes.put("/:id/modifier-groups", requireOwner, async (c) => {
  const tenantId = c.get("tenantId");
  const branchId = c.get("branchId");
  const productId = c.req.param("id");
  if (!productId) return c.json({ error: "Missing id" }, 400);
  const body = await c.req.json();
  const parsed = setProductModifierGroupsSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, 400);
  }

  const db = getDb();

  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId), eq(products.branchId, branchId)))
    .limit(1);
  if (!product) return c.json({ error: "Product not found" }, 404);

  const groupIds = parsed.data.modifierGroups.map((g) => g.modifierGroupId);
  if (groupIds.length) {
    const found = await db
      .select({ id: modifierGroups.id })
      .from(modifierGroups)
      .where(and(eq(modifierGroups.tenantId, tenantId), inArray(modifierGroups.id, groupIds)));
    if (found.length !== new Set(groupIds).size) {
      return c.json({ error: "One or more modifier groups not found" }, 404);
    }
  }

  await db
    .delete(productModifierGroups)
    .where(and(eq(productModifierGroups.tenantId, tenantId), eq(productModifierGroups.productId, productId)));

  if (groupIds.length) {
    await db.insert(productModifierGroups).values(
      parsed.data.modifierGroups.map((g, i) => ({
        tenantId,
        productId,
        modifierGroupId: g.modifierGroupId,
        isRequiredOverride: g.isRequiredOverride ?? null,
        sortOrder: g.sortOrder ?? i,
      })),
    );
  }

  return c.json({ success: true, modifierGroupIds: groupIds });
});