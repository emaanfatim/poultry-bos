import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { branches, users } from "@repo/database";
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
      phone: users.phone,
      role: users.role,
      isActive: users.isActive,
      branchId: users.branchId,
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

const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(50)
    .regex(/^[a-zA-Z0-9._-]+$/, "Username can only contain letters, numbers, dots, - and _"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  displayName: z.string().trim().min(1, "Display name is required").max(120),
  // Free-text so any local format/country code works; optional since not
  // every owner has it on hand at account-creation time.
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  // Any role except "owner" can be self-served here — full owner accounts
  // are provisioned outside this flow so an owner can't silently mint
  // another full-access owner account for the tenant from this form.
  role: z.enum(["cashier", "staff", "manager", "other"]).default("cashier"),
  // Which branch this staff member is pinned to. Required because an owner
  // managing several branches needs to say which one the new account
  // belongs to — it is NOT inferred from the owner's currently-active
  // branch, since that can be switched separately.
  branchId: z.string().uuid("Choose a branch"),
});

// POST /users — owner-only. Creates a new staff account (cashier, staff,
// manager, or other) for one of the owner's branches, with login
// credentials and optional contact details set up front. Till/discount/
// handover permissions are left at their safe defaults here and granted
// afterwards from Staff · Till and Staff · Discounts, same as for any
// other non-owner account.
usersRoutes.post("/", requireOwner, async (c) => {
  const tenantId = c.get("tenantId");
  const body = await c.req.json().catch(() => ({}));
  const parsed = createUserSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  const { username, password, displayName, role, branchId } = parsed.data;
  const phone = parsed.data.phone ? parsed.data.phone : null;

  const db = getDb();

  // Branch must belong to the caller's own tenant — an owner can only
  // create accounts on their own branches, not anyone else's.
  const [targetBranch] = await db
    .select({ id: branches.id })
    .from(branches)
    .where(and(eq(branches.id, branchId), eq(branches.tenantId, tenantId)))
    .limit(1);

  if (!targetBranch) {
    return c.json({ error: "Invalid branch" }, 400);
  }

  // Usernames are unique per tenant (users_tenant_username_idx), so check
  // up front for a friendly error instead of surfacing a raw DB conflict.
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.username, username)))
    .limit(1);

  if (existing) {
    return c.json({ error: "That username is already taken" }, 409);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [created] = await db
    .insert(users)
    .values({
      tenantId,
      branchId,
      username,
      passwordHash,
      displayName,
      phone,
      role,
    })
    .returning({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      phone: users.phone,
      role: users.role,
      isActive: users.isActive,
      branchId: users.branchId,
    });

  return c.json({ user: created }, 201);
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
