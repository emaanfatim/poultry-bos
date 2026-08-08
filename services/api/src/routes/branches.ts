import { Hono } from "hono";
import { asc, eq } from "drizzle-orm";
import { branches } from "@repo/database";
import { getDb } from "../db";
import { authMiddleware, requireOwner } from "../middleware/auth";
import type { AppVariables } from "../types";

// Owner Portal branch switcher — lists every branch under the caller's
// tenant so the owner can pick which one they're currently managing.
// Owner-only: a cashier's session is pinned to a single branch and never
// needs to see the rest of the tenant's branch list.
export const branchRoutes = new Hono<{ Variables: AppVariables }>();

branchRoutes.use("*", authMiddleware);
branchRoutes.use("*", requireOwner);

branchRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId");
  const db = getDb();

  const rows = await db
    .select({ id: branches.id, name: branches.name })
    .from(branches)
    .where(eq(branches.tenantId, tenantId))
    .orderBy(asc(branches.name));

  return c.json({ branches: rows });
});
