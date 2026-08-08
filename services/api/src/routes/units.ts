import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { units, products, productUnits } from "@repo/database";
import { getDb } from "../db";
import { authMiddleware, requireOwner } from "../middleware/auth";
import type { AppVariables } from "../types";

export const unitsRoutes = new Hono<{ Variables: AppVariables }>();

unitsRoutes.use("*", authMiddleware);

// GET /units — list all units for this tenant
unitsRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId");
  const branchId = c.get("branchId");
  const db = getDb();

  const allUnits = await db
    .select()
    .from(units)
    .where(and(eq(units.tenantId, tenantId), eq(units.branchId, branchId)))
    .orderBy(units.type, units.name);

  // Build a map so we can attach baseUnitCode to derived units
  const codeMap = Object.fromEntries(allUnits.map((u) => [u.id, u.code]));

  return c.json({
    units: allUnits.map((u) => ({
      id: u.id,
      name: u.name,
      code: u.code,
      type: u.type,
      isBase: u.isBase,
      baseUnitId: u.baseUnitId,
      baseUnitCode: u.baseUnitId ? (codeMap[u.baseUnitId] ?? null) : null,
      conversionFactor: u.conversionFactor,
      isActive: u.isActive,
    })),
  });
});

// GET /units/active — only active units (used by cashier screens)
unitsRoutes.get("/active", async (c) => {
  const tenantId = c.get("tenantId");
  const branchId = c.get("branchId");
  const db = getDb();

  const activeUnits = await db
    .select()
    .from(units)
    .where(and(eq(units.tenantId, tenantId), eq(units.branchId, branchId), eq(units.isActive, true)))
    .orderBy(units.type, units.name);

  const codeMap = Object.fromEntries(activeUnits.map((u) => [u.id, u.code]));

  return c.json({
    units: activeUnits.map((u) => ({
      id: u.id,
      name: u.name,
      code: u.code,
      type: u.type,
      isBase: u.isBase,
      baseUnitId: u.baseUnitId,
      baseUnitCode: u.baseUnitId ? (codeMap[u.baseUnitId] ?? null) : null,
      conversionFactor: u.conversionFactor,
      isActive: u.isActive,
    })),
  });
});

const createUnitSchema = z.object({
  name: z.string().min(1).max(50),
  code: z.string().min(1).max(20).regex(/^[a-z0-9_]+$/, "Code must be lowercase letters, numbers, or underscores"),
  type: z.enum(["weight", "volume", "count"]),
  isBase: z.boolean().default(false),
  baseUnitId: z.string().uuid().optional().nullable(),
  conversionFactor: z.string().regex(/^\d+(\.\d+)?$/).optional().nullable(),
}).refine(
  (data) => data.isBase || (data.baseUnitId && data.conversionFactor),
  { message: "Non-base units must have a base unit and conversion factor" }
);

// POST /units — owner creates a new unit
unitsRoutes.post("/", requireOwner, async (c) => {
  const tenantId = c.get("tenantId");
  const branchId = c.get("branchId");
  const body = await c.req.json();
  const parsed = createUnitSchema.safeParse(body);

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid unit data";
    return c.json({ error: message }, 400);
  }

  const db = getDb();

  // Base unit (if any) must belong to this tenant + branch
  if (parsed.data.baseUnitId) {
    const [baseUnit] = await db
      .select({ id: units.id })
      .from(units)
      .where(
        and(
          eq(units.id, parsed.data.baseUnitId),
          eq(units.tenantId, tenantId),
          eq(units.branchId, branchId),
        ),
      )
      .limit(1);
    if (!baseUnit) {
      return c.json({ error: "Base unit not found" }, 404);
    }
  }

  const [unit] = await db
    .insert(units)
    .values({
      tenantId,
      branchId,
      name: parsed.data.name,
      code: parsed.data.code,
      type: parsed.data.type,
      isBase: parsed.data.isBase,
      baseUnitId: parsed.data.baseUnitId ?? null,
      conversionFactor: parsed.data.conversionFactor ?? null,
      isActive: true,
    })
    .returning();

  return c.json({ unit }, 201);
});

const updateUnitSchema = z.object({
  name: z.string().min(1).max(50),
  conversionFactor: z.string().regex(/^\d+(\.\d+)?$/).optional().nullable(),
});

// PUT /units/:id — owner edits a unit name or conversion factor
unitsRoutes.put("/:id", requireOwner, async (c) => {
  const tenantId = c.get("tenantId");
  const branchId = c.get("branchId");
  const unitId = c.req.param("id");
  if (!unitId) {
    return c.json({ error: "Missing id" }, 400);
  }
  const body = await c.req.json();
  const parsed = updateUnitSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid unit data" }, 400);
  }

  const db = getDb();

  const [updated] = await db
    .update(units)
    .set({
      name: parsed.data.name,
      ...(parsed.data.conversionFactor !== undefined
        ? { conversionFactor: parsed.data.conversionFactor }
        : {}),
    })
    .where(and(eq(units.id, unitId), eq(units.tenantId, tenantId), eq(units.branchId, branchId)))
    .returning();

  if (!updated) return c.json({ error: "Unit not found" }, 404);
  return c.json({ unit: updated });
});

// PATCH /units/:id/toggle — owner toggles active/inactive
unitsRoutes.patch("/:id/toggle", requireOwner, async (c) => {
  const tenantId = c.get("tenantId");
  const branchId = c.get("branchId");
  const unitId = c.req.param("id");
  if (!unitId) {
    return c.json({ error: "Missing id" }, 400);
  }
  const db = getDb();

  const [current] = await db
    .select()
    .from(units)
    .where(and(eq(units.id, unitId), eq(units.tenantId, tenantId), eq(units.branchId, branchId)))
    .limit(1);

  if (!current) return c.json({ error: "Unit not found" }, 404);

  // Prevent deactivating a base unit that others depend on
  if (current.isBase && current.isActive) {
    const dependents = await db
      .select()
      .from(units)
      .where(
        and(
          eq(units.baseUnitId, unitId),
          eq(units.tenantId, tenantId),
          eq(units.branchId, branchId),
          eq(units.isActive, true),
        ),
      );
    if (dependents.length > 0) {
      return c.json(
        { error: `Cannot deactivate — ${dependents.length} unit(s) convert into this unit` },
        400,
      );
    }
  }

  const [updated] = await db
    .update(units)
    .set({ isActive: !current.isActive })
    .where(and(eq(units.id, unitId), eq(units.tenantId, tenantId), eq(units.branchId, branchId)))
    .returning();

  return c.json({ unit: updated });
});

// DELETE /units/:id — owner permanently removes a unit that's unused
unitsRoutes.delete("/:id", requireOwner, async (c) => {
  const tenantId = c.get("tenantId");
  const branchId = c.get("branchId");
  const unitId = c.req.param("id");
  if (!unitId) {
    return c.json({ error: "Missing id" }, 400);
  }
  const db = getDb();

  const [existing] = await db
    .select()
    .from(units)
    .where(and(eq(units.id, unitId), eq(units.tenantId, tenantId), eq(units.branchId, branchId)))
    .limit(1);

  if (!existing) {
    return c.json({ error: "Unit not found" }, 404);
  }

  // Block deletion when other units convert into this one
  const dependents = await db
    .select({ id: units.id })
    .from(units)
    .where(and(eq(units.baseUnitId, unitId), eq(units.tenantId, tenantId), eq(units.branchId, branchId)))
    .limit(1);

  if (dependents.length > 0) {
    return c.json(
      { error: "Cannot delete — other units convert into this one. Reassign or delete those first." },
      400,
    );
  }

  // Block deletion when a product is priced in this unit
  const priceUses = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.unitId, unitId), eq(products.tenantId, tenantId), eq(products.branchId, branchId)))
    .limit(1);

  if (priceUses.length > 0) {
    return c.json(
      { error: "Cannot delete — at least one product is priced in this unit." },
      400,
    );
  }

  // Block deletion when a product allows selling in this unit
  const sellUses = await db
    .select({ id: productUnits.id })
    .from(productUnits)
    .innerJoin(products, eq(productUnits.productId, products.id))
    .where(
      and(
        eq(productUnits.unitId, unitId),
        eq(productUnits.tenantId, tenantId),
        eq(products.branchId, branchId),
      ),
    )
    .limit(1);

  if (sellUses.length > 0) {
    return c.json(
      { error: "Cannot delete — at least one product allows selling in this unit." },
      400,
    );
  }

  await db
    .delete(units)
    .where(and(eq(units.id, unitId), eq(units.tenantId, tenantId), eq(units.branchId, branchId)));

  return c.json({ success: true });
});
