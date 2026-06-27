import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { productCategories, productSubCategories } from "@repo/database";
import { getDb } from "../db";
import { authMiddleware, requireOwner } from "../middleware/auth";

import type { AppVariables } from "../types";

export const categoryRoutes = new Hono<{ Variables: AppVariables }>();

// All routes require auth + owner role
categoryRoutes.use("*", authMiddleware);
categoryRoutes.use("*", requireOwner);

// ─── Schemas ────────────────────────────────────────────────────────────────

const createCategorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  token: z.string().min(1, "Token is required"),
});

const createSubCategorySchema = z.object({
  categoryId: z.string().uuid("Invalid category ID"),
  name: z.string().min(1, "Name is required"),
  token: z.string().min(1, "Token is required"),
});

// ─── Categories ─────────────────────────────────────────────────────────────

// GET /api/categories — list all categories with their subcategories
categoryRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId");
  const db = getDb();

  const cats = await db
    .select()
    .from(productCategories)
    .where(eq(productCategories.tenantId, tenantId));

  const subs = await db
    .select()
    .from(productSubCategories)
    .where(eq(productSubCategories.tenantId, tenantId));

  // Nest subcategories under their parent category
  const result = cats.map((cat) => ({
    ...cat,
    subCategories: subs.filter((s) => s.categoryId === cat.id),
  }));

  return c.json(result);
});

// POST /api/categories — create a new category
categoryRoutes.post("/", async (c) => {
  const tenantId = c.get("tenantId");
  const body = await c.req.json();
  const parsed = createCategorySchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.errors[0]?.message }, 400);
  }

  const db = getDb();

  const [category] = await db
    .insert(productCategories)
    .values({
      tenantId,
      name: parsed.data.name,
      token: parsed.data.token,
    })
    .returning();

  return c.json(category, 201);
});

// DELETE /api/categories/:id — delete a category
categoryRoutes.delete("/:id", async (c) => {
  const tenantId = c.get("tenantId");
  const id = c.req.param("id");
  const db = getDb();

  // Check it belongs to this tenant
  const [existing] = await db
    .select()
    .from(productCategories)
    .where(
      and(eq(productCategories.id, id), eq(productCategories.tenantId, tenantId))
    )
    .limit(1);

  if (!existing) {
    return c.json({ error: "Category not found" }, 404);
  }

  await db
    .delete(productCategories)
    .where(
      and(eq(productCategories.id, id), eq(productCategories.tenantId, tenantId))
    );

  return c.json({ success: true });
});

// ─── Subcategories ───────────────────────────────────────────────────────────

// POST /api/categories/subcategories — create a subcategory
categoryRoutes.post("/subcategories", async (c) => {
  const tenantId = c.get("tenantId");
  const body = await c.req.json();
  const parsed = createSubCategorySchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.errors[0]?.message }, 400);
  }

  // Verify the parent category belongs to this tenant
  const db = getDb();
  const [cat] = await db
    .select()
    .from(productCategories)
    .where(
      and(
        eq(productCategories.id, parsed.data.categoryId),
        eq(productCategories.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!cat) {
    return c.json({ error: "Category not found" }, 404);
  }

  const [subCategory] = await db
    .insert(productSubCategories)
    .values({
      tenantId,
      categoryId: parsed.data.categoryId,
      name: parsed.data.name,
      token: parsed.data.token,
    })
    .returning();

  return c.json(subCategory, 201);
});

// DELETE /api/categories/subcategories/:id — delete a subcategory
categoryRoutes.delete("/subcategories/:id", async (c) => {
  const tenantId = c.get("tenantId");
  const id = c.req.param("id");
  const db = getDb();

  const [existing] = await db
    .select()
    .from(productSubCategories)
    .where(
      and(
        eq(productSubCategories.id, id),
        eq(productSubCategories.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!existing) {
    return c.json({ error: "Subcategory not found" }, 404);
  }

  await db
    .delete(productSubCategories)
    .where(
      and(
        eq(productSubCategories.id, id),
        eq(productSubCategories.tenantId, tenantId)
      )
    );

  return c.json({ success: true });
});