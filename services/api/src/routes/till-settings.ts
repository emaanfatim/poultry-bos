import { Hono } from "hono";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { users } from "@repo/database";
import { getDb } from "../db";
import { authMiddleware, requireOwner } from "../middleware/auth";
import type { AppVariables } from "../types";

export const tillSettingsRoutes = new Hono<{ Variables: AppVariables }>();

tillSettingsRoutes.use("*", authMiddleware);
// Owner-only — same pattern as discount-settings: these caps decide what a
// cashier is allowed/required to do at checkout, so only the owner reads or
// changes them for someone else.
tillSettingsRoutes.use("*", requireOwner);

const selectFields = {
  id: users.id,
  username: users.username,
  displayName: users.displayName,
  isActive: users.isActive,
  requiresTillToSell: users.requiresTillToSell,
  requiresTillToSellScope: users.requiresTillToSellScope,
  requiresTillCount: users.requiresTillCount,
};

// GET /till-settings — every non-owner staff account (cashier, staff,
// manager, other) in this tenant/branch with their current till
// requirements. Owners aren't listed — these flags don't apply to them.
tillSettingsRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId");
  const branchId = c.get("branchId");
  const db = getDb();

  const rows = await db
    .select(selectFields)
    .from(users)
    .where(
      and(
        eq(users.tenantId, tenantId),
        eq(users.branchId, branchId),
        ne(users.role, "owner"),
      ),
    );

  return c.json({ cashiers: rows });
});

const updateSchema = z.object({
  requiresTillToSell: z.boolean().optional(),
  requiresTillToSellScope: z.enum(["all_bills", "priced_cash_only"]).optional(),
  requiresTillCount: z.boolean().optional(),
});

// PATCH /till-settings/:userId
tillSettingsRoutes.patch("/:userId", async (c) => {
  const tenantId = c.get("tenantId");
  const branchId = c.get("branchId");
  const userId = c.req.param("userId");
  const body = await c.req.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid settings" }, 400);
  }

  const db = getDb();

  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, userId),
        eq(users.tenantId, tenantId),
        eq(users.branchId, branchId),
        ne(users.role, "owner"),
      ),
    )
    .limit(1);

  if (!target) {
    return c.json({ error: "Cashier not found" }, 404);
  }

  const updates: Partial<typeof users.$inferInsert> = {};
  if (parsed.data.requiresTillToSell !== undefined) {
    updates.requiresTillToSell = parsed.data.requiresTillToSell;
  }
  if (parsed.data.requiresTillToSellScope !== undefined) {
    updates.requiresTillToSellScope = parsed.data.requiresTillToSellScope;
  }
  if (parsed.data.requiresTillCount !== undefined) {
    updates.requiresTillCount = parsed.data.requiresTillCount;
  }

  if (Object.keys(updates).length > 0) {
    await db.update(users).set(updates).where(eq(users.id, userId));
  }

  const [updated] = await db.select(selectFields).from(users).where(eq(users.id, userId)).limit(1);

  return c.json({ cashier: updated });
});