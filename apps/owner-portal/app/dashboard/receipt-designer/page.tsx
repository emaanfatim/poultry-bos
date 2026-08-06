"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReceiptBlock, ReceiptBlockType, ReceiptTemplatePresetId } from "@repo/types";
import { useAuth } from "../../providers/AuthProvider";
import { AuthGuard } from "../../components/AuthGuard";
import { Header } from "../../components/Header";
import {
  BLOCK_LABELS,
  LOCKED_IN_COMPLIANCE_MODE,
  RECEIPT_PRESETS,
  buildPresetBlocks,
  newCustomTextBlock,
  newDividerBlock,
} from "../../lib/receiptPresets";
import {
  clearBranchReceiptTemplate,
  fetchReceiptTemplate,
  saveReceiptTemplate,
  type ReceiptTemplateScope,
} from "../../services/receiptTemplates";
import { buildThermalPreviewLines, SAMPLE_RECEIPT_DATA } from "./thermalPreview";

export default function ReceiptDesignerPage() {
  return (
    <AuthGuard>
      <Header />
      <ReceiptDesignerContent />
    </AuthGuard>
  );
}

function ReceiptDesignerContent() {
  const { token, user, tenant, branch } = useAuth();

  const [scope, setScope] = useState<ReceiptTemplateScope>("branch");
  const [hasBranchOverride, setHasBranchOverride] = useState(false);
  const [presetId, setPresetId] = useState<ReceiptTemplatePresetId>("modern");
  const [taxComplianceMode, setTaxComplianceMode] = useState(false);
  const [blocks, setBlocks] = useState<ReceiptBlock[]>([]);
  const [expandedBlockId, setExpandedBlockId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  if (user?.role !== "owner") {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-slate-500">Access denied — owners only.</p>
      </div>
    );
  }

  async function loadForScope(nextScope: ReceiptTemplateScope) {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const template = await fetchReceiptTemplate(token, nextScope);
      if (nextScope === "branch") {
        setHasBranchOverride(!!template);
      }
      if (template) {
        setPresetId(template.presetId);
        setTaxComplianceMode(template.taxComplianceMode);
        setBlocks(template.config.blocks);
      } else if (nextScope === "branch") {
        // No branch override — check the tenant default so the designer
        // starts from what's actually printing today, not a blank slate.
        const tenantTemplate = await fetchReceiptTemplate(token, "tenant");
        if (tenantTemplate) {
          setPresetId(tenantTemplate.presetId);
          setTaxComplianceMode(tenantTemplate.taxComplianceMode);
          setBlocks(tenantTemplate.config.blocks);
        } else {
          setPresetId("modern");
          setTaxComplianceMode(false);
          setBlocks(buildPresetBlocks("modern"));
        }
      } else {
        setPresetId("modern");
        setTaxComplianceMode(false);
        setBlocks(buildPresetBlocks("modern"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load receipt template");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadForScope(scope);
    setExpandedBlockId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, scope]);

  function applyPreset(id: ReceiptTemplatePresetId) {
    setPresetId(id);
    setBlocks(buildPresetBlocks(id));
    setTaxComplianceMode(id === "compliance");
    setExpandedBlockId(null);
    setNotice(`Loaded "${RECEIPT_PRESETS.find((p) => p.id === id)?.name}" preset template`);
    setTimeout(() => setNotice(""), 4000);
  }

  function markCustom() {
    if (presetId !== "custom") setPresetId("custom");
  }

  function isLocked(type: ReceiptBlockType) {
    return taxComplianceMode && LOCKED_IN_COMPLIANCE_MODE.includes(type);
  }

  function toggleVisible(blockId: string) {
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId && !isLocked(b.type) ? { ...b, visible: !b.visible } : b)),
    );
    markCustom();
  }

  function removeBlock(blockId: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
    if (expandedBlockId === blockId) setExpandedBlockId(null);
    markCustom();
  }

  function updateBlock(blockId: string, patch: Partial<ReceiptBlock>) {
    setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, ...patch } : b)));
    markCustom();
  }

  function addDivider() {
    setBlocks((prev) => [...prev, newDividerBlock()]);
    markCustom();
  }

  function addCustomText() {
    const block = newCustomTextBlock();
    setBlocks((prev) => [...prev, block]);
    setExpandedBlockId(block.id);
    markCustom();
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    setBlocks((prev) => {
      const from = prev.findIndex((b) => b.id === dragId);
      const to = prev.findIndex((b) => b.id === targetId);
      if (from === -1 || to === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      return next;
    });
    markCustom();
    setDragId(null);
  }

  async function handleSave() {
    if (!token) return;
    setSaving(true);
    setError("");
    try {
      const saved = await saveReceiptTemplate(token, {
        scope,
        presetId,
        taxComplianceMode,
        blocks,
      });
      setPresetId(saved.presetId);
      if (scope === "branch") setHasBranchOverride(true);
      setNotice("Receipt template saved");
      setTimeout(() => setNotice(""), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save receipt template");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    await loadForScope(scope);
  }

  async function handleRemoveOverride() {
    if (!token) return;
    setSaving(true);
    setError("");
    try {
      await clearBranchReceiptTemplate(token);
      setHasBranchOverride(false);
      await loadForScope("branch");
      setNotice("Branch override removed — now using the tenant default");
      setTimeout(() => setNotice(""), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove override");
    } finally {
      setSaving(false);
    }
  }

  const previewLines = useMemo(
    () =>
      buildThermalPreviewLines(blocks, {
        businessName: tenant?.name ?? "Your Business Name",
        address: tenant?.address ?? undefined,
        phone: tenant?.phone ?? undefined,
        branchName: branch?.name ?? undefined,
        cashierName: user?.displayName ?? "Cashier",
        currencySymbol: tenant?.currencySymbol ?? "Rs",
      }),
    [blocks, tenant, branch, user],
  );

  return (
    <main className="mx-auto max-w-7xl p-4">
      <div className="mb-4 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <span>
          Changes here update what prints at checkout in the counter app{" "}
          {scope === "branch" ? `for ${branch?.name ?? "this branch"}` : "for every branch without its own override"}.
        </span>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              🖨 Receipt Designer
            </h1>
            <p className="text-sm text-slate-500">
              Customize the customer receipt. Enforces 48-character thermal line limits.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <span className="text-slate-600">Tax Compliance Mode</span>
              <input
                type="checkbox"
                checked={taxComplianceMode}
                onChange={(e) => {
                  setTaxComplianceMode(e.target.checked);
                  markCustom();
                }}
                className="h-4 w-4 accent-emerald-600"
              />
            </label>
            <button
              type="button"
              onClick={handleReset}
              disabled={loading || saving}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              ↺ Reset
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={loading || saving || blocks.length === 0}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? "Saving…" : "💾 Save Receipt Template"}
            </button>
          </div>
        </div>

        {/* Scope tabs */}
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setScope("branch")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              scope === "branch"
                ? "bg-slate-900 text-white"
                : "border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            This branch ({branch?.name ?? "current"})
          </button>
          <button
            type="button"
            onClick={() => setScope("tenant")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              scope === "tenant"
                ? "bg-slate-900 text-white"
                : "border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            All branches (default)
          </button>
          {scope === "branch" && hasBranchOverride && (
            <button
              type="button"
              onClick={handleRemoveOverride}
              disabled={saving}
              className="ml-2 text-sm text-red-600 underline hover:text-red-700 disabled:opacity-60"
            >
              Remove branch override
            </button>
          )}
          {scope === "branch" && !hasBranchOverride && !loading && (
            <span className="ml-2 text-sm text-slate-400">
              Currently inheriting the tenant default — saving here creates an override just for this branch.
            </span>
          )}
        </div>

        {/* Preset picker */}
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Select starter receipt template preset ({RECEIPT_PRESETS.length} options)
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {RECEIPT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  presetId === preset.id
                    ? "border-emerald-400 bg-emerald-50"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">{preset.name}</span>
                  {presetId === preset.id && <span className="text-emerald-600">✓</span>}
                </div>
                <p className="mt-1 text-xs text-slate-500">{preset.description}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Block list + preview */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Receipt block architecture ({blocks.length} blocks)
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={addCustomText}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                + Add Custom Text
              </button>
              <button
                type="button"
                onClick={addDivider}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                + Add Divider
              </button>
            </div>
          </div>

          {loading ? (
            <p className="py-8 text-center text-sm text-slate-400">Loading…</p>
          ) : (
            <div className="space-y-2">
              {blocks.map((block) => {
                const locked = isLocked(block.type);
                return (
                  <div
                    key={block.id}
                    draggable
                    onDragStart={() => setDragId(block.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(block.id)}
                    className={`rounded-xl border bg-white ${
                      dragId === block.id ? "opacity-50" : ""
                    } border-slate-200`}
                  >
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <span className="cursor-grab select-none text-slate-300" title="Drag to reorder">
                        ⠿
                      </span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-900">
                          {BLOCK_LABELS[block.type]}
                          {locked && (
                            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500">
                              Locked
                            </span>
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleVisible(block.id)}
                        disabled={locked}
                        title={block.visible ? "Visible" : "Hidden"}
                        className={`rounded-lg border px-2.5 py-1.5 text-sm disabled:opacity-40 ${
                          block.visible
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 text-slate-400"
                        }`}
                      >
                        {block.visible ? "👁" : "🚫"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedBlockId(expandedBlockId === block.id ? null : block.id)
                        }
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Configure
                      </button>
                      <button
                        type="button"
                        onClick={() => removeBlock(block.id)}
                        disabled={locked}
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                      >
                        🗑
                      </button>
                    </div>

                    {expandedBlockId === block.id && (
                      <BlockConfigPanel
                        block={block}
                        onChange={(patch) => updateBlock(block.id, patch)}
                      />
                    )}
                  </div>
                );
              })}

              {blocks.length === 0 && (
                <p className="py-8 text-center text-sm text-slate-400">
                  No blocks yet — pick a preset above or add one.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Live thermal preview */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              🖨 Hardware Thermal Preview (80mm / 48 chars)
            </p>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
              MONOSPACE ESC/POS
            </span>
          </div>
          <div className="flex justify-center bg-slate-100 p-4">
            <pre className="w-[340px] overflow-x-auto whitespace-pre bg-white p-4 font-mono text-[11px] leading-[1.35] text-slate-900 shadow-md">
              {previewLines.join("\n")}
            </pre>
          </div>
          <p className="mt-2 text-center text-[11px] text-slate-400">
            Preview uses sample order data (ticket #{SAMPLE_RECEIPT_DATA.ticketNumber}) — actual receipts pull live order details.
          </p>
        </div>
      </div>
    </main>
  );
}

// ─── Per-block configuration panel ─────────────────────────────────────────

function BlockConfigPanel({
  block,
  onChange,
}: {
  block: ReceiptBlock;
  onChange: (patch: Partial<ReceiptBlock>) => void;
}) {
  const textFieldTypes: ReceiptBlockType[] = [
    "business_name",
    "subtitle",
    "footer_message",
    "custom_text",
  ];

  return (
    <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
      {textFieldTypes.includes(block.type) && (
        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-slate-600">
            {block.type === "custom_text"
              ? "Text"
              : "Override text (leave blank to use live business data)"}
          </label>
          <input
            type="text"
            value={block.text ?? ""}
            onChange={(e) => onChange({ text: e.target.value })}
            placeholder={
              block.type === "business_name"
                ? "e.g. Velocitill Burger Lab"
                : block.type === "subtitle"
                  ? "e.g. Gourmet Burgers & Shakes"
                  : block.type === "footer_message"
                    ? "e.g. Thank you for your visit!"
                    : "Promo line, social handle, etc."
            }
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
      )}

      {textFieldTypes.includes(block.type) && (
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Alignment</label>
            <select
              value={block.align ?? "center"}
              onChange={(e) =>
                onChange({ align: e.target.value as "left" | "center" | "right" })
              }
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={!!block.bold}
              onChange={(e) => onChange({ bold: e.target.checked })}
              className="h-4 w-4 accent-emerald-600"
            />
            Bold
          </label>
        </div>
      )}

      {block.type === "divider" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Style</label>
          <select
            value={block.style ?? "solid"}
            onChange={(e) => onChange({ style: e.target.value as "solid" | "dashed" | "double" })}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          >
            <option value="solid">Solid ————</option>
            <option value="dashed">Dashed - - - -</option>
            <option value="double">Double ════</option>
          </select>
        </div>
      )}

      {block.type === "order_metadata" && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(
            [
              ["showTicketNumber", "Ticket #"],
              ["showInvoiceNumber", "Invoice No."],
              ["showDateTime", "Date & time"],
              ["showCashier", "Cashier"],
              ["showTable", "Table / dine-in tag"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={block.metadataFields?.[key] ?? true}
                onChange={(e) =>
                  onChange({
                    metadataFields: {
                      showTicketNumber: true,
                      showInvoiceNumber: true,
                      showDateTime: true,
                      showCashier: true,
                      showTable: true,
                      ...block.metadataFields,
                      [key]: e.target.checked,
                    },
                  })
                }
                className="h-4 w-4 accent-emerald-600"
              />
              {label}
            </label>
          ))}
        </div>
      )}

      {block.type === "items_list" && (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={block.showModifiers ?? true}
            onChange={(e) => onChange({ showModifiers: e.target.checked })}
            className="h-4 w-4 accent-emerald-600"
          />
          Show modifier/extras sub-rows under each item
        </label>
      )}

      {block.type === "totals" && (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={block.showTaxBreakdown ?? false}
            onChange={(e) => onChange({ showTaxBreakdown: e.target.checked })}
            className="h-4 w-4 accent-emerald-600"
          />
          Show itemized tax/charge breakdown (vs. a single combined line)
        </label>
      )}

      {block.type === "payment_info" && (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={block.showPaymentMethod ?? true}
            onChange={(e) => onChange({ showPaymentMethod: e.target.checked })}
            className="h-4 w-4 accent-emerald-600"
          />
          Show payment method
        </label>
      )}

      {block.type === "customer_info" && (
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={block.showCustomerName ?? true}
              onChange={(e) => onChange({ showCustomerName: e.target.checked })}
              className="h-4 w-4 accent-emerald-600"
            />
            Show customer name
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={block.showCustomerPhone ?? true}
              onChange={(e) => onChange({ showCustomerPhone: e.target.checked })}
              className="h-4 w-4 accent-emerald-600"
            />
            Show customer phone
          </label>
        </div>
      )}

      {block.type === "notes" && (
        <p className="text-xs text-slate-500">
          Shows the order's notes field when the transaction has one — no extra options.
        </p>
      )}
    </div>
  );
}
