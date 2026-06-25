import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  productCategories,
  products,
  productSubCategories,
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
      unit: products.unit,
      currentPrice: products.currentPrice,
      status: products.status,
      categoryName: productCategories.name,
      subCategoryName: productSubCategories.name,
    })
    .from(products)
    .innerJoin(productSubCategories, eq(products.subCategoryId, productSubCategories.id))
    .innerJoin(productCategories, eq(productSubCategories.categoryId, productCategories.id))
    .where(and(eq(products.tenantId, tenantId), eq(products.status, "active")));

  return c.json({ products: rows });
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
  if (!productId) {
    return c.json({ error: "Product ID required" }, 400);
  }
  const body = await c.req.json();
  const parsed = singlePriceSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid price" }, 400);
  }

  const db = getDb();
  const [updated] = await db
    .update(products)
    .set({ currentPrice: parsed.data.currentPrice, updatedAt: new Date() })
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)))
    .returning();

  if (!updated) {
    return c.json({ error: "Product not found" }, 404);
  }

  return c.json({ product: updated });
});
