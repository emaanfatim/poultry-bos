import { Hono } from "hono";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  modifierGroups,
  modifierOptions,
  productModifierGroups,
  productSubCategories,
  products,
  transactionLineModifiers,
} from "@repo/database";
import type { Database } from "@repo/database";
import { getDb } from "../db";
import { authMiddleware, requireOwner } from "../middleware/auth";
import type { AppVariables } from "../types";

// ─── Modifier Groups — reusable customization library (product-catalogue
// handover §2/§3). Built once by the Owner, attached to as many products as
// needed. Two flavours of group:
//   - Manual group: options are typed in by the Owner (e.g. Size, Milk).
//   - Linked group (linkedToSubCategoryId set): options are NOT typed in —
//     they mirror whichever products currently sit in that sub-category
//     (e.g. "Packaging" → Small Box / Large Box), so price never drifts
//     from the real catalogue. `syncLinkedGroupOptions` keeps the option
//     rows in step with the sub-category every time a linked group is read.
export const modifierGroupRoutes = new Hono<{ Variables: AppVariables }>();

modifierGroupRoutes.use("*", authMiddleware);

const optionSchema = z.object({
  label: z.string().min(1, "Option label is required"),
  includedFreeQuantity: z.number().int().min(0).optional().default(0),
  pricePerAdditionalUnit: z
    .union([z.string(), z.number()])
    .transform((v) => String(v))
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), "Invalid price")
    .optional()
    .default("0"),
  maxQuantity: z.number().int().min(1).optional().nullable(),
  linkedProductId: z.string().uuid().optional().nullable(),
  sortOrder: z.number().int().optional().default(0),
});

const groupSchema = z.object({
  name: z.string().min(1, "Name is required"),
  selectionType: z.enum(["single", "multi"]),
  isRequired: z.boolean().optional().default(false),
  isPriced: z.boolean().optional().default(false),
  linkedToSubCategoryId: z.string().uuid().optional().nullable(),
  // Ignored (and may be omitted) when linkedToSubCategoryId is set — a
  // linked group's options are derived from the sub-category instead.
  options: z.array(optionSchema).optional().default([]),
});

/**
 * Keeps a linked group's options in sync with the products currently active
 * in its linked sub-category: adds options for new products, removes options
 * for products no longer in that sub-category, and refreshes the price
 * snapshot for the rest. Safe to call repeatedly (idempotent).
 */
export async function syncLinkedGroupOptions(db: Database, tenantId: string, groupId: string, subCategoryId: string) {
  const subCategoryProducts = await db
    .select({ id: products.id, name: products.name, currentPrice: products.currentPrice })
    .from(products)
    .where(
      and(
        eq(products.tenantId, tenantId),
        eq(products.subCategoryId, subCategoryId),
        eq(products.status, "active"),
      ),
    );

  const existingOptions = await db
    .select()
    .from(modifierOptions)
    .where(and(eq(modifierOptions.tenantId, tenantId), eq(modifierOptions.modifierGroupId, groupId)));

  const existingByProductId = new Map(
    existingOptions.filter((o) => o.linkedProductId).map((o) => [o.linkedProductId as string, o]),
  );
  const currentProductIds = new Set(subCategoryProducts.map((p) => p.id));

  // Remove options whose linked product is gone or no longer in this sub-category
  const staleOptionIds = existingOptions
    .filter((o) => !o.linkedProductId || !currentProductIds.has(o.linkedProductId))
    .map((o) => o.id);
  if (staleOptionIds.length) {
    await db.delete(modifierOptions).where(inArray(modifierOptions.id, staleOptionIds));
  }

  // Insert options for products that don't have one yet, refresh price on existing ones
  for (let i = 0; i < subCategoryProducts.length; i++) {
    const product = subCategoryProducts[i]!;
    const existing = existingByProductId.get(product.id);
    if (existing) {
      await db
        .update(modifierOptions)
        .set({ label: product.name, pricePerAdditionalUnit: product.currentPrice })
        .where(eq(modifierOptions.id, existing.id));
    } else {
      await db.insert(modifierOptions).values({
        tenantId,
        modifierGroupId: groupId,
        label: product.name,
        includedFreeQuantity: 0,
        pricePerAdditionalUnit: product.currentPrice,
        maxQuantity: null,
        linkedProductId: product.id,
        sortOrder: i,
      });
    }
  }
}

async function loadGroupWithOptions(db: Database, tenantId: string, groupId: string) {
  const [group] = await db
    .select()
    .from(modifierGroups)
    .where(and(eq(modifierGroups.id, groupId), eq(modifierGroups.tenantId, tenantId)))
    .limit(1);

  if (!group) return null;

  if (group.linkedToSubCategoryId) {
    await syncLinkedGroupOptions(db, tenantId, group.id, group.linkedToSubCategoryId);
  }

  const options = await db
    .select()
    .from(modifierOptions)
    .where(and(eq(modifierOptions.tenantId, tenantId), eq(modifierOptions.modifierGroupId, group.id)))
    .orderBy(modifierOptions.sortOrder);

  return { ...group, options };
}

// GET /modifier-groups — the full library, options included
modifierGroupRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId");
  const includeInactive = c.req.query("includeInactive") === "true";
  const db = getDb();

  const conditions = [eq(modifierGroups.tenantId, tenantId)];
  if (!includeInactive) conditions.push(eq(modifierGroups.isActive, true));

  const groups = await db
    .select()
    .from(modifierGroups)
    .where(and(...conditions))
    .orderBy(modifierGroups.name);

  // Sync any linked groups before loading their options in bulk
  for (const group of groups) {
    if (group.linkedToSubCategoryId) {
      await syncLinkedGroupOptions(db, tenantId, group.id, group.linkedToSubCategoryId);
    }
  }

  const groupIds = groups.map((g) => g.id);
  const allOptions = groupIds.length
    ? await db
        .select()
        .from(modifierOptions)
        .where(and(eq(modifierOptions.tenantId, tenantId), inArray(modifierOptions.modifierGroupId, groupIds)))
        .orderBy(modifierOptions.sortOrder)
    : [];

  return c.json({
    modifierGroups: groups.map((group) => ({
      ...group,
      options: allOptions.filter((o) => o.modifierGroupId === group.id),
    })),
  });
});

// GET /modifier-groups/:id
modifierGroupRoutes.get("/:id", async (c) => {
  const tenantId = c.get("tenantId");
  const id = c.req.param("id");
  if (!id) return c.json({ error: "Missing id" }, 400);
  const db = getDb();

  const group = await loadGroupWithOptions(db, tenantId, id);
  if (!group) return c.json({ error: "Modifier group not found" }, 404);

  return c.json({ modifierGroup: group });
});

// POST /modifier-groups — create (Owner only)
modifierGroupRoutes.post("/", requireOwner, async (c) => {
  const tenantId = c.get("tenantId");
  const body = await c.req.json();
  const parsed = groupSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid modifier group data" }, 400);
  }

  const db = getDb();

  if (parsed.data.linkedToSubCategoryId) {
    const [subCategory] = await db
      .select()
      .from(productSubCategories)
      .where(
        and(
          eq(productSubCategories.id, parsed.data.linkedToSubCategoryId),
          eq(productSubCategories.tenantId, tenantId),
        ),
      )
      .limit(1);
    if (!subCategory) return c.json({ error: "Sub-category not found" }, 404);
  } else if (parsed.data.options.length === 0) {
    return c.json({ error: "At least one option is required" }, 400);
  }

  // Manual (non-linked) options may reference a real product for live pricing
  const manualLinkedIds = parsed.data.options
    .map((o) => o.linkedProductId)
    .filter((id): id is string => !!id);
  if (manualLinkedIds.length) {
    const found = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.tenantId, tenantId), inArray(products.id, manualLinkedIds)));
    if (found.length !== new Set(manualLinkedIds).size) {
      return c.json({ error: "One or more linked products not found" }, 404);
    }
  }

  const [group] = await db
    .insert(modifierGroups)
    .values({
      tenantId,
      name: parsed.data.name,
      selectionType: parsed.data.selectionType,
      isRequired: parsed.data.isRequired,
      isPriced: parsed.data.isPriced,
      linkedToSubCategoryId: parsed.data.linkedToSubCategoryId ?? null,
      isActive: true,
    })
    .returning();

  if (!group) return c.json({ error: "Failed to create modifier group" }, 500);

  if (parsed.data.linkedToSubCategoryId) {
    await syncLinkedGroupOptions(db, tenantId, group.id, parsed.data.linkedToSubCategoryId);
  } else {
    await db.insert(modifierOptions).values(
      parsed.data.options.map((o, i) => ({
        tenantId,
        modifierGroupId: group.id,
        label: o.label,
        includedFreeQuantity: o.includedFreeQuantity,
        pricePerAdditionalUnit: o.pricePerAdditionalUnit,
        maxQuantity: o.maxQuantity ?? null,
        linkedProductId: o.linkedProductId ?? null,
        sortOrder: o.sortOrder ?? i,
      })),
    );
  }

  const full = await loadGroupWithOptions(db, tenantId, group.id);
  return c.json({ modifierGroup: full }, 201);
});

// PATCH /modifier-groups/:id — edit group settings + full-replace its options
// (mirrors the "replace the whole set" pattern used for units/rate lines
// elsewhere in this codebase). Ignored for the options list when the group
// is/becomes linked — those are always derived from the sub-category.
modifierGroupRoutes.patch("/:id", requireOwner, async (c) => {
  const tenantId = c.get("tenantId");
  const id = c.req.param("id");
  if (!id) return c.json({ error: "Missing id" }, 400);
  const body = await c.req.json();
  const parsed = groupSchema.partial().extend({
    isActive: z.boolean().optional(),
  }).safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid modifier group data" }, 400);
  }

  const db = getDb();

  const [existing] = await db
    .select()
    .from(modifierGroups)
    .where(and(eq(modifierGroups.id, id), eq(modifierGroups.tenantId, tenantId)))
    .limit(1);
  if (!existing) return c.json({ error: "Modifier group not found" }, 404);

  const nextLinkedToSubCategoryId =
    parsed.data.linkedToSubCategoryId !== undefined
      ? parsed.data.linkedToSubCategoryId
      : existing.linkedToSubCategoryId;

  if (nextLinkedToSubCategoryId) {
    const [subCategory] = await db
      .select()
      .from(productSubCategories)
      .where(
        and(
          eq(productSubCategories.id, nextLinkedToSubCategoryId),
          eq(productSubCategories.tenantId, tenantId),
        ),
      )
      .limit(1);
    if (!subCategory) return c.json({ error: "Sub-category not found" }, 404);
  }

  await db
    .update(modifierGroups)
    .set({
      name: parsed.data.name ?? existing.name,
      selectionType: parsed.data.selectionType ?? existing.selectionType,
      isRequired: parsed.data.isRequired ?? existing.isRequired,
      isPriced: parsed.data.isPriced ?? existing.isPriced,
      isActive: parsed.data.isActive ?? existing.isActive,
      linkedToSubCategoryId: nextLinkedToSubCategoryId ?? null,
    })
    .where(eq(modifierGroups.id, id));

  if (nextLinkedToSubCategoryId) {
    await syncLinkedGroupOptions(db, tenantId, id, nextLinkedToSubCategoryId);
  } else if (parsed.data.options) {
    if (parsed.data.options.length === 0) {
      return c.json({ error: "At least one option is required" }, 400);
    }
    await db.delete(modifierOptions).where(eq(modifierOptions.modifierGroupId, id));
    await db.insert(modifierOptions).values(
      parsed.data.options.map((o, i) => ({
        tenantId,
        modifierGroupId: id,
        label: o.label,
        includedFreeQuantity: o.includedFreeQuantity,
        pricePerAdditionalUnit: o.pricePerAdditionalUnit,
        maxQuantity: o.maxQuantity ?? null,
        linkedProductId: o.linkedProductId ?? null,
        sortOrder: o.sortOrder ?? i,
      })),
    );
  }

  const full = await loadGroupWithOptions(db, tenantId, id);
  return c.json({ modifierGroup: full });
});

// DELETE /modifier-groups/:id — soft delete. Existing product attachments
// and historical transaction lines are left untouched; the group just stops
// appearing as available to attach to (new) products.
modifierGroupRoutes.delete("/:id", requireOwner, async (c) => {
  const tenantId = c.get("tenantId");
  const id = c.req.param("id");
  if (!id) return c.json({ error: "Missing id" }, 400);
  const db = getDb();

  const [updated] = await db
    .update(modifierGroups)
    .set({ isActive: false })
    .where(and(eq(modifierGroups.id, id), eq(modifierGroups.tenantId, tenantId)))
    .returning();

  if (!updated) return c.json({ error: "Modifier group not found" }, 404);
  return c.json({ success: true });
});

// DELETE /modifier-groups/:id/permanent — owner permanently removes a
// modifier group that's unused. Blocked if it's still attached to any
// product, or if it was ever actually selected on a past sale (those
// receipts/kitchen tickets must keep referring to it) — deactivate instead
// in either case.
modifierGroupRoutes.delete("/:id/permanent", requireOwner, async (c) => {
  const tenantId = c.get("tenantId");
  const id = c.req.param("id");
  if (!id) return c.json({ error: "Missing id" }, 400);
  const db = getDb();

  const [existing] = await db
    .select()
    .from(modifierGroups)
    .where(and(eq(modifierGroups.id, id), eq(modifierGroups.tenantId, tenantId)))
    .limit(1);
  if (!existing) return c.json({ error: "Modifier group not found" }, 404);

  // Block deletion when still attached to a product
  const productAttachments = await db
    .select({ id: productModifierGroups.id })
    .from(productModifierGroups)
    .where(
      and(
        eq(productModifierGroups.modifierGroupId, id),
        eq(productModifierGroups.tenantId, tenantId),
      ),
    )
    .limit(1);
  if (productAttachments.length > 0) {
    return c.json(
      { error: "Cannot delete — still attached to at least one product. Remove it there first." },
      400,
    );
  }

  // Block deletion when it appears in historical sales — those transaction
  // lines must keep a valid reference for receipts/reports.
  const historicalUses = await db
    .select({ id: transactionLineModifiers.id })
    .from(transactionLineModifiers)
    .where(
      and(
        eq(transactionLineModifiers.modifierGroupId, id),
        eq(transactionLineModifiers.tenantId, tenantId),
      ),
    )
    .limit(1);
  if (historicalUses.length > 0) {
    return c.json(
      {
        error:
          "Cannot delete — it was used on a past sale. Deactivate it instead to keep history intact.",
      },
      400,
    );
  }

  await db.delete(modifierOptions).where(eq(modifierOptions.modifierGroupId, id));
  await db
    .delete(modifierGroups)
    .where(and(eq(modifierGroups.id, id), eq(modifierGroups.tenantId, tenantId)));

  return c.json({ success: true });
});