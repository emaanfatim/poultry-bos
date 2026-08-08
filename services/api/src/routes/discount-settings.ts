import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  cashierDiscountCategories,
  cashierDiscountProducts,
  productCategories,
  products,
  users,
} from "@repo/database";
import { getDb } from "../db";
import { authMiddleware, requireOwner } from "../middleware/auth";
import type { AppVariables } from "../types";

export const discountSettingsRoutes = new Hono<{ Variables: AppVariables }>();

discountSettingsRoutes.use("*", authMiddleware);

// GET /discount-settings/me — self-service, any authenticated cashier.
// Lets the POS check the current user's own discount permissions and,
// when discountRestrictedToProducts is on, which specific products they're
// approved to discount — so checkout can show this before the cashier
// tries to apply a discount, instead of only after a 403 comes back.
discountSettingsRoutes.get("/me", async (c) => {
  const tenantId = c.get("tenantId");
  const authUser = c.get("user");
  const db = getDb();

  const [target] = await db
    .select({
      id: users.id,
      canApplyDiscount: users.canApplyDiscount,
      maxDiscountPercentage: users.maxDiscountPercentage,
      maxDiscountFlatAmount: users.maxDiscountFlatAmount,
      discountRestrictedToProducts: users.discountRestrictedToProducts,
      discountRestrictedToCategories: users.discountRestrictedToCategories,
      discountBillTypeScope: users.discountBillTypeScope,
      roundingMethodOverride: users.roundingMethodOverride,
    })
    .from(users)
    .where(and(eq(users.id, authUser.id), eq(users.tenantId, tenantId)))
    .limit(1);

  if (!target) {
    return c.json({ error: "User not found" }, 404);
  }

  const allowedProducts = target.discountRestrictedToProducts
    ? await db
        .select({ productId: cashierDiscountProducts.productId })
        .from(cashierDiscountProducts)
        .where(
          and(
            eq(cashierDiscountProducts.tenantId, tenantId),
            eq(cashierDiscountProducts.userId, authUser.id),
          ),
        )
    : [];

  const allowedCategories = target.discountRestrictedToCategories
    ? await db
        .select({ categoryId: cashierDiscountCategories.categoryId })
        .from(cashierDiscountCategories)
        .where(
          and(
            eq(cashierDiscountCategories.tenantId, tenantId),
            eq(cashierDiscountCategories.userId, authUser.id),
          ),
        )
    : [];

  return c.json({
    settings: {
      userId: target.id,
      canApplyDiscount: target.canApplyDiscount,
      maxDiscountPercentage: target.maxDiscountPercentage,
      maxDiscountFlatAmount: target.maxDiscountFlatAmount,
      discountRestrictedToProducts: target.discountRestrictedToProducts,
      allowedProductIds: allowedProducts.map((row) => row.productId),
      discountRestrictedToCategories: target.discountRestrictedToCategories,
      allowedCategoryIds: allowedCategories.map((row) => row.categoryId),
      discountBillTypeScope: target.discountBillTypeScope,
      roundingMethodOverride: target.roundingMethodOverride,
    },
  });
});

// Everything below is owner-only — the caps that gate what a cashier can
// do at checkout, so only the owner may read or change them for others.
discountSettingsRoutes.use("*", requireOwner);

// GET /discount-settings — every cashier (role = cashier) in the active
// branch, with their current discount grant/caps. Owners aren't listed —
// the discount cap system doesn't apply to them. Scoped by branchId (see
// till-settings.ts for the equivalent pattern) so switching branches in
// the Owner Portal shows that branch's own cashiers, not every cashier in
// the tenant.
discountSettingsRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId");
  const branchId = c.get("branchId");
  const db = getDb();

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      isActive: users.isActive,
      canApplyDiscount: users.canApplyDiscount,
      maxDiscountPercentage: users.maxDiscountPercentage,
      maxDiscountFlatAmount: users.maxDiscountFlatAmount,
      discountRestrictedToProducts: users.discountRestrictedToProducts,
      discountRestrictedToCategories: users.discountRestrictedToCategories,
      discountBillTypeScope: users.discountBillTypeScope,
      roundingMethodOverride: users.roundingMethodOverride,
    })
    .from(users)
    .where(
      and(
        eq(users.tenantId, tenantId),
        eq(users.branchId, branchId),
        eq(users.role, "cashier"),
      ),
    );

  return c.json({ cashiers: rows });
});

// GET /discount-settings/:userId — one cashier's full settings, including
// the allowed-product list (only meaningful when
// discountRestrictedToProducts = true, but always returned so the Owner
// Portal can pre-fill the product picker before the toggle is flipped on).
discountSettingsRoutes.get("/:userId", async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.req.param("userId");
  const db = getDb();

  const [target] = await db
    .select({
      id: users.id,
      canApplyDiscount: users.canApplyDiscount,
      maxDiscountPercentage: users.maxDiscountPercentage,
      maxDiscountFlatAmount: users.maxDiscountFlatAmount,
      discountRestrictedToProducts: users.discountRestrictedToProducts,
      discountRestrictedToCategories: users.discountRestrictedToCategories,
      discountBillTypeScope: users.discountBillTypeScope,
      roundingMethodOverride: users.roundingMethodOverride,
    })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId), eq(users.role, "cashier")))
    .limit(1);

  if (!target) {
    return c.json({ error: "Cashier not found" }, 404);
  }

  const allowedProducts = await db
    .select({ productId: cashierDiscountProducts.productId })
    .from(cashierDiscountProducts)
    .where(
      and(
        eq(cashierDiscountProducts.tenantId, tenantId),
        eq(cashierDiscountProducts.userId, userId),
      ),
    );

  const allowedCategories = await db
    .select({ categoryId: cashierDiscountCategories.categoryId })
    .from(cashierDiscountCategories)
    .where(
      and(
        eq(cashierDiscountCategories.tenantId, tenantId),
        eq(cashierDiscountCategories.userId, userId),
      ),
    );

  return c.json({
    settings: {
      userId: target.id,
      canApplyDiscount: target.canApplyDiscount,
      maxDiscountPercentage: target.maxDiscountPercentage,
      maxDiscountFlatAmount: target.maxDiscountFlatAmount,
      discountRestrictedToProducts: target.discountRestrictedToProducts,
      allowedProductIds: allowedProducts.map((row) => row.productId),
      discountRestrictedToCategories: target.discountRestrictedToCategories,
      allowedCategoryIds: allowedCategories.map((row) => row.categoryId),
      discountBillTypeScope: target.discountBillTypeScope,
      roundingMethodOverride: target.roundingMethodOverride,
    },
  });
});

const updateSchema = z.object({
  canApplyDiscount: z.boolean().optional(),
  // Explicit null clears that cap (discount type becomes disallowed for
  // this cashier); omit the key entirely to leave it unchanged.
  maxDiscountPercentage: z.number().min(0).max(100).nullable().optional(),
  maxDiscountFlatAmount: z.number().min(0).nullable().optional(),
  discountRestrictedToProducts: z.boolean().optional(),
  // Full replacement of the allowed-product list; omit to leave unchanged.
  allowedProductIds: z.array(z.string().uuid()).optional(),
  discountRestrictedToCategories: z.boolean().optional(),
  // Full replacement of the allowed-category list; omit to leave unchanged.
  allowedCategoryIds: z.array(z.string().uuid()).optional(),
  // Which bill types this cashier's discount grant reaches — priced bills
  // only, or priced + unpriced (credit/delivery-note) bills alike.
  discountBillTypeScope: z.enum(["priced_only", "priced_and_unpriced"]).optional(),
  // Explicit null clears the override (this cashier goes back to whatever
  // the payment method itself is set to); omit to leave unchanged.
  roundingMethodOverride: z.enum(["exact", "round_up", "round_down"]).nullable().optional(),
});

// PATCH /discount-settings/:userId
discountSettingsRoutes.patch("/:userId", async (c) => {
  const tenantId = c.get("tenantId");
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
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId), eq(users.role, "cashier")))
    .limit(1);

  if (!target) {
    return c.json({ error: "Cashier not found" }, 404);
  }

  // Validate every referenced product actually belongs to this tenant
  // before touching anything, so a bad id can't partially apply.
  if (parsed.data.allowedProductIds) {
    const rows = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.tenantId, tenantId));
    const validIds = new Set(rows.map((r) => r.id));
    const invalid = parsed.data.allowedProductIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      return c.json({ error: "One or more selected products were not found" }, 400);
    }
  }

  // Same check for categories — belongs-to-tenant before anything is touched.
  if (parsed.data.allowedCategoryIds) {
    const rows = await db
      .select({ id: productCategories.id })
      .from(productCategories)
      .where(eq(productCategories.tenantId, tenantId));
    const validIds = new Set(rows.map((r) => r.id));
    const invalid = parsed.data.allowedCategoryIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      return c.json({ error: "One or more selected categories were not found" }, 400);
    }
  }

  const updates: Partial<typeof users.$inferInsert> = {};
  if (parsed.data.canApplyDiscount !== undefined) {
    updates.canApplyDiscount = parsed.data.canApplyDiscount;
  }
  if (parsed.data.maxDiscountPercentage !== undefined) {
    updates.maxDiscountPercentage =
      parsed.data.maxDiscountPercentage === null ? null : String(parsed.data.maxDiscountPercentage);
  }
  if (parsed.data.maxDiscountFlatAmount !== undefined) {
    updates.maxDiscountFlatAmount =
      parsed.data.maxDiscountFlatAmount === null ? null : String(parsed.data.maxDiscountFlatAmount);
  }
  if (parsed.data.discountRestrictedToProducts !== undefined) {
    updates.discountRestrictedToProducts = parsed.data.discountRestrictedToProducts;
  }
  if (parsed.data.discountRestrictedToCategories !== undefined) {
    updates.discountRestrictedToCategories = parsed.data.discountRestrictedToCategories;
  }
  if (parsed.data.discountBillTypeScope !== undefined) {
    updates.discountBillTypeScope = parsed.data.discountBillTypeScope;
  }
  if (parsed.data.roundingMethodOverride !== undefined) {
    updates.roundingMethodOverride = parsed.data.roundingMethodOverride;
  }

  if (Object.keys(updates).length > 0) {
    await db.update(users).set(updates).where(eq(users.id, userId));
  }

  if (parsed.data.allowedProductIds) {
    await db
      .delete(cashierDiscountProducts)
      .where(
        and(
          eq(cashierDiscountProducts.tenantId, tenantId),
          eq(cashierDiscountProducts.userId, userId),
        ),
      );
    if (parsed.data.allowedProductIds.length > 0) {
      await db.insert(cashierDiscountProducts).values(
        parsed.data.allowedProductIds.map((productId) => ({
          tenantId,
          userId,
          productId,
        })),
      );
    }
  }

  if (parsed.data.allowedCategoryIds) {
    await db
      .delete(cashierDiscountCategories)
      .where(
        and(
          eq(cashierDiscountCategories.tenantId, tenantId),
          eq(cashierDiscountCategories.userId, userId),
        ),
      );
    if (parsed.data.allowedCategoryIds.length > 0) {
      await db.insert(cashierDiscountCategories).values(
        parsed.data.allowedCategoryIds.map((categoryId) => ({
          tenantId,
          userId,
          categoryId,
        })),
      );
    }
  }

  const [updated] = await db
    .select({
      id: users.id,
      canApplyDiscount: users.canApplyDiscount,
      maxDiscountPercentage: users.maxDiscountPercentage,
      maxDiscountFlatAmount: users.maxDiscountFlatAmount,
      discountRestrictedToProducts: users.discountRestrictedToProducts,
      discountRestrictedToCategories: users.discountRestrictedToCategories,
      discountBillTypeScope: users.discountBillTypeScope,
      roundingMethodOverride: users.roundingMethodOverride,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const allowedProducts = await db
    .select({ productId: cashierDiscountProducts.productId })
    .from(cashierDiscountProducts)
    .where(
      and(
        eq(cashierDiscountProducts.tenantId, tenantId),
        eq(cashierDiscountProducts.userId, userId),
      ),
    );

  const allowedCategories = await db
    .select({ categoryId: cashierDiscountCategories.categoryId })
    .from(cashierDiscountCategories)
    .where(
      and(
        eq(cashierDiscountCategories.tenantId, tenantId),
        eq(cashierDiscountCategories.userId, userId),
      ),
    );

  return c.json({
    settings: {
      userId: updated!.id,
      canApplyDiscount: updated!.canApplyDiscount,
      maxDiscountPercentage: updated!.maxDiscountPercentage,
      maxDiscountFlatAmount: updated!.maxDiscountFlatAmount,
      discountRestrictedToProducts: updated!.discountRestrictedToProducts,
      allowedProductIds: allowedProducts.map((row) => row.productId),
      discountRestrictedToCategories: updated!.discountRestrictedToCategories,
      allowedCategoryIds: allowedCategories.map((row) => row.categoryId),
      discountBillTypeScope: updated!.discountBillTypeScope,
      roundingMethodOverride: updated!.roundingMethodOverride,
    },
  });
});