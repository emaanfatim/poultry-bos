import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { users } from "@repo/database";
import { getDb } from "../db";
import { authMiddleware, requireOwner } from "../middleware/auth";
import type { AppVariables } from "../types";

export const usersRoutes = new Hono<{ Variables: AppVariables }>();

usersRoutes.use("*", authMiddleware);

// GET /users — list staff for this branch, with their till settings
// (Handover doc, Part 1 §2 and §6). Any authenticated staff member can read
// this — it's needed to show cashier names on handovers/reports — but only
// the owner can change the settings below. Scoped to the active branch
// (c.get("branchId") — the owner's selected branch via X-Branch-Id, or the
// caller's own pinned branch for non-owners) since users.branchId is a
// strict one-branch assignment; without this filter every branch showed
// the same tenant-wide staff list.
usersRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId");
  const branchId = c.get("branchId");
  const db = getDb();

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      isActive: users.isActive,
      requiresTillCount: users.requiresTillCount,
      canReceiveHandover: users.canReceiveHandover,
      reportsToId: users.reportsToId,
      canApplyDiscount: users.canApplyDiscount,
      maxDiscountPercentage: users.maxDiscountPercentage,
      maxDiscountFlatAmount: users.maxDiscountFlatAmount,
      discountRestrictedToProducts: users.discountRestrictedToProducts,
    })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.branchId, branchId)));

  return c.json({ users: rows });
});

const tillSettingsSchema = z.object({
  requiresTillCount: z.boolean().optional(),
  canReceiveHandover: z.boolean().optional(),
  // Explicit null clears the reporting line; omit to leave unchanged.
  reportsToId: z.string().uuid().nullable().optional(),
});

// PATCH /users/:id/till-settings — owner-only. Lets the owner promote any
// trusted staff member into a "Chief Cashier" just by flipping these two
// settings, without a new account type (Handover doc, Part 1 §6).
usersRoutes.patch("/:id/till-settings", requireOwner, async (c) => {
  const tenantId = c.get("tenantId");
  const targetId = c.req.param("id");
  if (!targetId) {
    return c.json({ error: "Missing id" }, 400);
  }
  const body = await c.req.json();
  const parsed = tillSettingsSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid settings" }, 400);
  }

  const db = getDb();

  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, targetId), eq(users.tenantId, tenantId)))
    .limit(1);

  if (!target) {
    return c.json({ error: "User not found" }, 404);
  }

  if (parsed.data.reportsToId) {
    const [supervisor] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, parsed.data.reportsToId), eq(users.tenantId, tenantId)))
      .limit(1);
    if (!supervisor) {
      return c.json({ error: "Supervisor not found" }, 400);
    }
  }

  const updates: Partial<typeof users.$inferInsert> = {};
  if (parsed.data.requiresTillCount !== undefined) {
    updates.requiresTillCount = parsed.data.requiresTillCount;
  }
  if (parsed.data.canReceiveHandover !== undefined) {
    updates.canReceiveHandover = parsed.data.canReceiveHandover;
  }
  if (parsed.data.reportsToId !== undefined) {
    updates.reportsToId = parsed.data.reportsToId;
  }

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, targetId))
    .returning({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      requiresTillCount: users.requiresTillCount,
      canReceiveHandover: users.canReceiveHandover,
      reportsToId: users.reportsToId,
    });

  return c.json({ user: updated });
});
