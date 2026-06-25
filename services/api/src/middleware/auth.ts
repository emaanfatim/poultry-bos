import type { Context, Next } from "hono";
import { jwtVerify } from "jose";
import type { AuthUser } from "@repo/types";
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

    await next();
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
}

export function requireOwner(c: AuthContext, next: Next) {
  const user = c.get("user");
  if (user.role !== "owner") {
    return c.json({ error: "Forbidden — owner access required" }, 403);
  }
  return next();
}
