import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { drafts, users } from "@repo/database";
import { getDb } from "../db";
import { authMiddleware } from "../middleware/auth";
import type { AppVariables } from "../types";

export const draftsRoutes = new Hono<{ Variables: AppVariables }>();

draftsRoutes.use("*", authMiddleware);

const draftItemSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string(),
  quantity: z.number().positive(),
  rate: z.string(),
  unit: z.string(),
});

const createDraftSchema = z.object({
  customerName: z.string().max(100).optional(),
  customerPhone: z.string().max(30).optional(),
  items: z.array(draftItemSchema).min(1),
  subtotal: z.string(),
});

// GET /drafts — list all drafts for this branch (no expiry — manual delete only)
draftsRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId");
  const branchId = c.get("branchId");
  const db = getDb();

  const activeDrafts = await db
    .select({
      id: drafts.id,
      draftNumber: drafts.draftNumber,
      customerName: drafts.customerName,
      customerPhone: drafts.customerPhone,
      items: drafts.items,
      subtotal: drafts.subtotal,
      createdAt: drafts.createdAt,
      createdByName: users.displayName,
    })
    .from(drafts)
    .innerJoin(users, eq(drafts.createdBy, users.id))
    .where(
      and(
        eq(drafts.tenantId, tenantId),
        eq(drafts.branchId, branchId),
      ),
    )
    .orderBy(drafts.createdAt);

  return c.json({
    drafts: activeDrafts.map((d) => ({
      ...d,
      createdAt: d.createdAt.toISOString(),
    })),
  });
});

// POST /drafts — save a new draft
draftsRoutes.post("/", async (c) => {
  const tenantId = c.get("tenantId");
  const branchId = c.get("branchId");
  const user = c.get("user");
  const body = await c.req.json();
  const parsed = createDraftSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid draft data" }, 400);
  }

  const db = getDb();

  // Check draft limit — max 8 per branch
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(drafts)
    .where(
      and(
        eq(drafts.tenantId, tenantId),
        eq(drafts.branchId, branchId),
      ),
    );

  if ((countResult?.count ?? 0) >= 10) {
    return c.json(
      { error: "Maximum of 10 drafts allowed. Please resume or delete an existing draft first." },
      400,
    );
  }

  // Get next draft number for this branch
  const [maxResult] = await db
    .select({ max: sql<number>`coalesce(max(${drafts.draftNumber}), 0)::int` })
    .from(drafts)
    .where(
      and(
        eq(drafts.tenantId, tenantId),
        eq(drafts.branchId, branchId),
      ),
    );

  const draftNumber = (maxResult?.max ?? 0) + 1;

  const [draft] = await db
    .insert(drafts)
    .values({
      tenantId,
      branchId,
      createdBy: user.id,
      draftNumber,
      customerName: parsed.data.customerName?.trim() || null,
      customerPhone: parsed.data.customerPhone?.trim() || null,
      items: parsed.data.items,
      subtotal: parsed.data.subtotal,
    })
    .returning();

  return c.json({
    draft: {
      id: draft!.id,
      draftNumber: draft!.draftNumber,
      customerName: draft!.customerName,
      customerPhone: draft!.customerPhone,
      items: draft!.items,
      subtotal: draft!.subtotal,
      createdAt: draft!.createdAt.toISOString(),
    },
  });
});

// DELETE /drafts/:id — delete a draft
draftsRoutes.delete("/:id", async (c) => {
  const tenantId = c.get("tenantId");
  const draftId = c.req.param("id");
  const db = getDb();

  await db
    .delete(drafts)
    .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)));

  return c.json({ success: true });
});
