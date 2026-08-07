import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { branches, tenants } from "@repo/database";
import { getDb } from "../db";
import { authMiddleware, requireOwner } from "../middleware/auth";
import type { AppVariables } from "../types";

// Business Profile — the tenant's address/phone and the current branch's
// name. There's no dedicated settings screen for these in the app; they're
// edited inline from the Receipt Designer's "subtitle" block, since that's
// the only place they're ever surfaced to the owner. Owner-only, same
// pattern as receipt-templates.ts.
export const businessProfileRoutes = new Hono<{ Variables: AppVariables }>();

businessProfileRoutes.use("*", authMiddleware);
businessProfileRoutes.use("*", requireOwner);

function formatTenant(tenant: typeof tenants.$inferSelect) {
  return {
    id: tenant.id,
    name: tenant.name,
    currency: tenant.currency,
    currencySymbol: tenant.currencySymbol,
    address: tenant.address ?? null,
    phone: tenant.phone ?? null,
  };
}

function formatBranch(branch: typeof branches.$inferSelect) {
  return { id: branch.id, name: branch.name, token: branch.token };
}

const updateSchema = z
  .object({
    address: z.string().trim().max(500).nullable().optional(),
    phone: z.string().trim().max(50).nullable().optional(),
    branchName: z.string().trim().min(1, "Branch name can't be empty").max(200).optional(),
  })
  .refine((v) => v.address !== undefined || v.phone !== undefined || v.branchName !== undefined, {
    message: "Nothing to update",
  });

// PUT /business-profile — updates the tenant's address/phone and/or the
// caller's own branch name. Any field left out of the body is untouched.
businessProfileRoutes.put("/", async (c) => {
  const tenantId = c.get("tenantId");
  const branchId = c.get("branchId");
  const body = await c.req.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  const { address, phone, branchName } = parsed.data;
  const db = getDb();

  let tenant: typeof tenants.$inferSelect | undefined;
  if (address !== undefined || phone !== undefined) {
    [tenant] = await db
      .update(tenants)
      .set({
        ...(address !== undefined ? { address: address === "" ? null : address } : {}),
        ...(phone !== undefined ? { phone: phone === "" ? null : phone } : {}),
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId))
      .returning();
  } else {
    [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  }

  let branch: typeof branches.$inferSelect | undefined;
  if (branchName !== undefined) {
    [branch] = await db
      .update(branches)
      .set({ name: branchName })
      .where(eq(branches.id, branchId))
      .returning();
  } else {
    [branch] = await db.select().from(branches).where(eq(branches.id, branchId)).limit(1);
  }

  if (!tenant || !branch) {
    return c.json({ error: "Tenant or branch not found" }, 404);
  }

  return c.json({ tenant: formatTenant(tenant), branch: formatBranch(branch) });
});
