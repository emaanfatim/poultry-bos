import type { Context, Next } from "hono";
import { jwtVerify } from "jose";
import { and, eq } from "drizzle-orm";
import { branches } from "@repo/database";
import type { AuthUser } from "@repo/types";
import { getDb } from "../db";
import { getJwtSecret } from "../lib/jwt";
import type { AppVariables } from "../types";

type AuthContext = Context<{ Variables: AppVariables }>;

export async function authMiddleware(c: AuthContext, next: Next) {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = header.slice(7);

  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    const user = payload.user as AuthUser;

    if (!user?.tenantId || !user?.id) {
      return c.json({ error: "Invalid token" }, 401);
    }

    c.set("tenantId", user.tenantId);
    c.set("user", user);
    c.set("branchId", user.branchId);
    c.set("branchToken", (payload.branchToken as string) ?? "B1");

    // Owner Portal branch switcher — an owner viewing/managing a branch
    // other than the one their own account is pinned to sends the target
    // branch in this header. Only owners can steer this, and only onto a
    // branch that actually belongs to their own tenant, so a cashier (or a
    // tampered header) can never read/write another tenant's — or another
    // branch's — data this way. branchToken is deliberately left alone:
    // it's only used for receipt-numbering on sale creation, which owner
    // portal never does.
    const requestedBranchId = c.req.header("X-Branch-Id");
    if (requestedBranchId && requestedBranchId !== user.branchId) {
      if (user.role !== "owner") {
        return c.json({ error: "Only owners can switch branches" }, 403);
      }

      const db = getDb();
      const [targetBranch] = await db
        .select({ id: branches.id })
        .from(branches)
        .where(and(eq(branches.id, requestedBranchId), eq(branches.tenantId, user.tenantId)))
        .limit(1);

      if (!targetBranch) {
        return c.json({ error: "Invalid branch" }, 403);
      }

      c.set("branchId", targetBranch.id);
    }

    await next();
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
}

export async function requireOwner(c: AuthContext, next: Next) {
  const user = c.get("user");
  if (user.role !== "owner") {
    return c.json({ error: "Forbidden — owner access required" }, 403);
  }
  return next();
}
