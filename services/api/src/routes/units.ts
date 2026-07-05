import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { units } from "@repo/database";
import { getDb } from "../db";
import { authMiddleware, requireOwner } from "../middleware/auth";
import type { AppVariables } from "../types";

export const unitsRoutes = new Hono<{ Variables: AppVariables }>();

unitsRoutes.use("*", authMiddleware);

// GET /units — list all units for this tenant
unitsRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId");
  const db = getDb();

  const allUnits = await db
    .select()
    .from(units)
    .where(eq(units.tenantId, tenantId))
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
  const db = getDb();

  const activeUnits = await db
    .select()
    .from(units)
    .where(and(eq(units.tenantId, tenantId), eq(units.isActive, true)))
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
  const body = await c.req.json();
  const parsed = createUnitSchema.safeParse(body);

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid unit data";
    return c.json({ error: message }, 400);
  }

  const db = getDb();

  const [unit] = await db
    .insert(units)
    .values({
      tenantId,
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
  const unitId = c.req.param("id");
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
    .where(and(eq(units.id, unitId), eq(units.tenantId, tenantId)))
    .returning();

  if (!updated) return c.json({ error: "Unit not found" }, 404);
  return c.json({ unit: updated });
});

// PATCH /units/:id/toggle — owner toggles active/inactive
unitsRoutes.patch("/:id/toggle", requireOwner, async (c) => {
  const tenantId = c.get("tenantId");
  const unitId = c.req.param("id");
  const db = getDb();

  const [current] = await db
    .select()
    .from(units)
    .where(and(eq(units.id, unitId), eq(units.tenantId, tenantId)))
    .limit(1);

  if (!current) return c.json({ error: "Unit not found" }, 404);

  // Prevent deactivating a base unit that others depend on
  if (current.isBase && current.isActive) {
    const dependents = await db
      .select()
      .from(units)
      .where(and(eq(units.baseUnitId, unitId), eq(units.isActive, true)));
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
    .where(and(eq(units.id, unitId), eq(units.tenantId, tenantId)))
    .returning();

  return c.json({ unit: updated });
});
