import { Hono } from "hono";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { z } from "zod";
import { branches, tenants, users } from "@repo/database";
import { getDb } from "../db";
import { getJwtSecret } from "../lib/jwt";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

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

export const authRoutes = new Hono();

authRoutes.post("/login", async (c) => {
  const body = await c.req.json();
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Username and password are required" }, 400);
  }

  const db = getDb();
  const { username, password } = parsed.data;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (!user || !user.isActive) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, user.tenantId))
    .limit(1);

  const [branch] = await db
    .select()
    .from(branches)
    .where(eq(branches.id, user.branchId))
    .limit(1);

  if (!tenant || !branch) {
    return c.json({ error: "Tenant configuration error" }, 500);
  }

  const authUser = {
    id: user.id,
    tenantId: user.tenantId,
    branchId: user.branchId,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    canIssuePricedBill: true,
  };
  const token = await new SignJWT({ user: authUser, branchToken: branch.token })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(getJwtSecret());

  return c.json({
    token,
    user: authUser,
    tenant: formatTenant(tenant),
    branch: {
      id: branch.id,
      name: branch.name,
      token: branch.token,
    },
  });
});

authRoutes.get("/me", async (c) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { jwtVerify } = await import("jose");
  try {
    const { payload } = await jwtVerify(header.slice(7), getJwtSecret());
    const user = payload.user as {
      id: string;
      tenantId: string;
      branchId: string;
      username: string;
      displayName: string;
      role: "owner" | "cashier";
      canIssuePricedBill?: boolean;
    };

    const db = getDb();
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, user.tenantId))
      .limit(1);

    const [branch] = await db
      .select()
      .from(branches)
      .where(eq(branches.id, user.branchId))
      .limit(1);

    return c.json({
      user: { ...user, canIssuePricedBill: true },
      tenant: tenant ? formatTenant(tenant) : null,
      branch: branch
        ? { id: branch.id, name: branch.name, token: branch.token }
        : null,
    });
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
});
