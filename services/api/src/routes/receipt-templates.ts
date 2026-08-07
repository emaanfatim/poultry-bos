import { Hono } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { receiptTemplates } from "@repo/database";
import { getDb } from "../db";
import { authMiddleware, requireOwner } from "../middleware/auth";
import type { AppVariables } from "../types";

// Receipt Designer — templates are scoped either to a single branch
// (branchId set) or to the whole tenant as the fallback default
// (branchId null). At most one row per scope is kept; "saving" always
// upserts rather than versioning, since a receipt layout has no audit
// requirement the way charges/tax do.
export const receiptTemplateRoutes = new Hono<{ Variables: AppVariables }>();

receiptTemplateRoutes.use("*", authMiddleware);

function scopeCondition(tenantId: string, branchId: string | null) {
  return branchId
    ? and(eq(receiptTemplates.tenantId, tenantId), eq(receiptTemplates.branchId, branchId))
    : and(eq(receiptTemplates.tenantId, tenantId), isNull(receiptTemplates.branchId));
}

async function findRow(
  db: ReturnType<typeof getDb>,
  tenantId: string,
  branchId: string | null,
) {
  const [row] = await db
    .select()
    .from(receiptTemplates)
    .where(scopeCondition(tenantId, branchId))
    .limit(1);
  return row ?? null;
}

// GET /receipt-templates/resolve — the effective template for the caller's
// own branch: their branch's override if one has been saved, otherwise the
// tenant-wide default, otherwise null (meaning "use the app's built-in
// default layout"). Any authenticated staff member can read this — it's
// what drives the printed receipt at checkout, not just the owner portal.
receiptTemplateRoutes.get("/resolve", async (c) => {
  const tenantId = c.get("tenantId");
  const branchId = c.get("branchId");
  const db = getDb();

  const branchRow = await findRow(db, tenantId, branchId);
  const row = branchRow ?? (await findRow(db, tenantId, null));

  if (!row) return c.json({ template: null });

  return c.json({
    template: {
      id: row.id,
      tenantId: row.tenantId,
      branchId: row.branchId,
      presetId: row.presetId,
      config: row.config,
      updatedAt: row.updatedAt,
    },
  });
});

// Everything below is owner-only — editing the template is a config change,
// same as every other settings route in this codebase.
receiptTemplateRoutes.use("*", requireOwner);

// GET /receipt-templates?scope=branch|tenant — the raw saved row for that
// scope (not resolved/merged), so the designer can tell whether the current
// branch has its own override or is inheriting the tenant default. Returns
// { template: null } when nothing has been saved for that scope yet.
receiptTemplateRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId");
  const branchId = c.get("branchId");
  const scope = c.req.query("scope") === "tenant" ? "tenant" : "branch";
  const db = getDb();

  const row = await findRow(db, tenantId, scope === "branch" ? branchId : null);
  if (!row) return c.json({ template: null });

  return c.json({
    template: {
      id: row.id,
      tenantId: row.tenantId,
      branchId: row.branchId,
      presetId: row.presetId,
      config: row.config,
      updatedAt: row.updatedAt,
    },
  });
});

const receiptBlockSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "logo_header",
    "business_name",
    "subtitle",
    "divider",
    "order_metadata",
    "items_list",
    "totals",
    "payment_info",
    "customer_info",
    "notes",
    "footer_message",
    "custom_text",
  ]),
  visible: z.boolean(),
  text: z.string().optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  bold: z.boolean().optional(),
  style: z.enum(["solid", "dashed", "double"]).optional(),
  metadataFields: z
    .object({
      showInvoiceNumber: z.boolean(),
      showDateTime: z.boolean(),
      showCashier: z.boolean(),
    })
    .optional(),
  // subtitle
  showAddress: z.boolean().optional(),
  showPhone: z.boolean().optional(),
  showBranchName: z.boolean().optional(),
  showModifiers: z.boolean().optional(),
  showTaxBreakdown: z.boolean().optional(),
  showPaymentMethod: z.boolean().optional(),
  showCustomerName: z.boolean().optional(),
  showCustomerPhone: z.boolean().optional(),
  // logo_header — data URL string, or null once removed. Capped generously;
  // the client compresses to well under this before ever sending it.
  imageKey: z.string().max(2_000_000).nullable().optional(),
});

const saveSchema = z.object({
  scope: z.enum(["branch", "tenant"]),
  presetId: z.enum(["minimal", "classic", "modern", "branded", "custom"]),
  blocks: z.array(receiptBlockSchema).min(1),
});

// PUT /receipt-templates — upsert the template for the given scope.
receiptTemplateRoutes.put("/", async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("user").id;
  const branchId = c.get("branchId");
  const body = await c.req.json();
  const parsed = saveSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid template" }, 400);
  }

  const targetBranchId = parsed.data.scope === "branch" ? branchId : null;
  const db = getDb();
  const existing = await findRow(db, tenantId, targetBranchId);

  const config = {
    presetId: parsed.data.presetId,
    blocks: parsed.data.blocks,
  };

  const values = {
    tenantId,
    branchId: targetBranchId,
    presetId: parsed.data.presetId,
    // Kept in the DB row for backward compatibility with older saved
    // templates; the designer no longer exposes this setting.
    taxComplianceMode: false,
    config,
    updatedByUserId: userId,
    updatedAt: new Date(),
  };

  let row;
  if (existing) {
    [row] = await db
      .update(receiptTemplates)
      .set(values)
      .where(eq(receiptTemplates.id, existing.id))
      .returning();
  } else {
    [row] = await db.insert(receiptTemplates).values(values).returning();
  }

  return c.json({
    template: {
      id: row!.id,
      tenantId: row!.tenantId,
      branchId: row!.branchId,
      presetId: row!.presetId,
      config: row!.config,
      updatedAt: row!.updatedAt,
    },
  });
});

// DELETE /receipt-templates?scope=branch — removes the branch-specific
// override so the branch falls back to the tenant default again. Deleting
// the tenant scope isn't supported here since that's the last fallback
// before the app's hardcoded default — clearing it is done by saving the
// "modern" preset back over it instead of leaving branches with nothing.
receiptTemplateRoutes.delete("/", async (c) => {
  const tenantId = c.get("tenantId");
  const branchId = c.get("branchId");
  const scope = c.req.query("scope");

  if (scope !== "branch") {
    return c.json({ error: "Only a branch-level override can be removed" }, 400);
  }

  const db = getDb();
  await db
    .delete(receiptTemplates)
    .where(and(eq(receiptTemplates.tenantId, tenantId), eq(receiptTemplates.branchId, branchId)));

  return c.json({ success: true });
});
