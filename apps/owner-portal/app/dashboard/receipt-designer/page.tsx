"use client";

import { useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";
import type { ReceiptBlock, ReceiptBlockType, ReceiptTemplatePresetId } from "@repo/types";
import { useAuth } from "../../providers/AuthProvider";
import { AuthGuard } from "../../components/AuthGuard";
import { Header } from "../../components/Header";
import { fileToLogoImage, ImageProcessingError } from "../../lib/image";
import {
  BLOCK_LABELS,
  RECEIPT_PRESETS,
  buildPresetBlocks,
  newCustomTextBlock,
  newCustomerInfoBlock,
  newDividerBlock,
  newLogoHeaderBlock,
} from "../../lib/receiptPresets";
import {
  clearBranchReceiptTemplate,
  fetchReceiptTemplate,
  saveReceiptTemplate,
  type ReceiptTemplateScope,
} from "../../services/receiptTemplates";
import { fetchProducts } from "../../services/products";
import { buildThermalPreviewLines, SAMPLE_RECEIPT_DATA, type PreviewLineItem } from "./thermalPreview";

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
  const [blocks, setBlocks] = useState<ReceiptBlock[]>([]);
  const [expandedBlockId, setExpandedBlockId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [logoUploadingId, setLogoUploadingId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Remembers the blocks you were editing under each preset during this
  // session, so hopping between preset cards (Minimal/Classic/etc.) to
  // compare them doesn't throw away work you did on any of them — and so
  // clicking back onto a preset you already customized (e.g. uploaded a
  // logo onto "Branded") brings that customization back instead of
  // resetting to the preset's bare factory defaults.
  const [presetSessionCache, setPresetSessionCache] = useState<
    Partial<Record<ReceiptTemplatePresetId, ReceiptBlock[]>>
  >({});

  // Real inventory items, pulled in so the hardware preview shows what this
  // business actually sells instead of the fixed sample dishes.
  const [previewItems, setPreviewItems] = useState<PreviewLineItem[]>([]);

  useEffect(() => {
    if (!token) return;
    fetchProducts(token)
      .then((products) => {
        const active = products.filter((p) => p.status === "active");
        const qtyCycle = [1, 4, 2];
        setPreviewItems(
          active.slice(0, 3).map((p, idx) => ({
            name: p.name,
            qty: qtyCycle[idx % qtyCycle.length] ?? 1,
            rate: parseFloat(p.currentPrice) || 0,
          })),
        );
      })
      // The preview quietly falls back to sample data if this fails —
      // it's illustrative only, not worth surfacing an error banner for.
      .catch(() => setPreviewItems([]));
  }, [token]);

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
        setBlocks(template.config.blocks);
        setPresetSessionCache((prev) => ({ ...prev, [template.presetId]: template.config.blocks }));
      } else if (nextScope === "branch") {
        // No branch override — check the tenant default so the designer
        // starts from what's actually printing today, not a blank slate.
        const tenantTemplate = await fetchReceiptTemplate(token, "tenant");
        if (tenantTemplate) {
          setPresetId(tenantTemplate.presetId);
          setBlocks(tenantTemplate.config.blocks);
          setPresetSessionCache((prev) => ({
            ...prev,
            [tenantTemplate.presetId]: tenantTemplate.config.blocks,
          }));
        } else {
          setPresetId("modern");
          setBlocks(buildPresetBlocks("modern"));
        }
      } else {
        setPresetId("modern");
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
    setPresetSessionCache({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, scope]);

  function applyPreset(id: ReceiptTemplatePresetId) {
    if (id === presetId) return;
    // Stash what you've got under the preset you're leaving, so switching
    // back to it later (even without saving) brings your edits back rather
    // than resetting to bare factory defaults.
    setPresetSessionCache((prev) => ({ ...prev, [presetId]: blocks }));

    // If you've already customized this preset earlier in this session
    // (e.g. uploaded a logo onto "Branded", then looked at "Classic", then
    // came back), restore that instead of wiping it out again.
    const cached = presetSessionCache[id];
    setPresetId(id);
    setBlocks(cached ?? buildPresetBlocks(id));
    setExpandedBlockId(null);
    setNotice(
      cached
        ? `Restored your "${RECEIPT_PRESETS.find((p) => p.id === id)?.name}" customization`
        : `Loaded "${RECEIPT_PRESETS.find((p) => p.id === id)?.name}" preset template`,
    );
    setTimeout(() => setNotice(""), 4000);
  }

  function toggleVisible(blockId: string) {
    setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, visible: !b.visible } : b)));
  }

  function removeBlock(blockId: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
    if (expandedBlockId === blockId) setExpandedBlockId(null);
  }

  function updateBlock(blockId: string, patch: Partial<ReceiptBlock>) {
    setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, ...patch } : b)));
  }

  function addDivider() {
    setBlocks((prev) => [...prev, newDividerBlock()]);
  }

  function addCustomText() {
    const block = newCustomTextBlock();
    setBlocks((prev) => [...prev, block]);
    setExpandedBlockId(block.id);
  }

  function addLogoHeader() {
    const block = newLogoHeaderBlock();
    setBlocks((prev) => [block, ...prev]);
    setExpandedBlockId(block.id);
  }

  function addCustomerInfo() {
    const block = newCustomerInfoBlock();
    setBlocks((prev) => [...prev, block]);
    setExpandedBlockId(block.id);
  }

  const hasLogoBlock = blocks.some((b) => b.type === "logo_header");
  const hasCustomerInfoBlock = blocks.some((b) => b.type === "customer_info");

  async function handleLogoFile(blockId: string, file: File | undefined) {
    if (!file) return;
    setLogoUploadingId(blockId);
    setError("");
    try {
      const dataUrl = await fileToLogoImage(file);
      updateBlock(blockId, { imageKey: dataUrl });
    } catch (e: unknown) {
      setError(e instanceof ImageProcessingError ? e.message : "Failed to process logo image");
    } finally {
      setLogoUploadingId(null);
    }
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
        blocks,
      });
      setPresetId(saved.presetId);
      setPresetSessionCache((prev) => ({ ...prev, [saved.presetId]: saved.config.blocks }));
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
      buildThermalPreviewLines(
        blocks,
        {
          businessName: tenant?.name ?? "Your Business Name",
          address: tenant?.address ?? undefined,
          phone: tenant?.phone ?? undefined,
          branchName: branch?.name ?? undefined,
          cashierName: user?.displayName ?? "Cashier",
          currencySymbol: tenant?.currencySymbol ?? "Rs",
        },
        previewItems,
      ),
    [blocks, tenant, branch, user, previewItems],
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
              {!hasLogoBlock && (
                <button
                  type="button"
                  onClick={addLogoHeader}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  + Add Logo
                </button>
              )}
              {!hasCustomerInfoBlock && (
                <button
                  type="button"
                  onClick={addCustomerInfo}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  + Add Customer Info
                </button>
              )}
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
                        </p>
                      </div>
                      {block.type === "logo_header" && (
                        <label
                          className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                            logoUploadingId === block.id
                              ? "border-slate-200 text-slate-400"
                              : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          }`}
                        >
                          🖼 {logoUploadingId === block.id ? "Uploading…" : "Upload Logo"}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={logoUploadingId === block.id}
                            onChange={(e) => {
                              void handleLogoFile(block.id, e.target.files?.[0]);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleVisible(block.id)}
                        title={block.visible ? "Visible" : "Hidden"}
                        className={`rounded-lg border px-2.5 py-1.5 text-sm ${
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
                        {expandedBlockId === block.id ? "Done" : "Configure"}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeBlock(block.id)}
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        🗑
                      </button>
                    </div>

                    {expandedBlockId === block.id && (
                      <BlockConfigPanel
                        block={block}
                        onChange={(patch) => updateBlock(block.id, patch)}
                        onLogoFile={(file) => handleLogoFile(block.id, file)}
                        logoUploading={logoUploadingId === block.id}
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
          <div className="flex justify-center bg-[#ece7dc] p-4">
            <pre className="w-[340px] overflow-x-auto whitespace-pre rounded-sm bg-[#faf7ef] p-4 font-mono text-[11px] leading-[1.35] text-[#3d3527] shadow-md">
              {previewLines.join("\n")}
            </pre>
          </div>
          <p className="mt-2 text-center text-[11px] text-slate-400">
            Preview uses sample order data (invoice #{SAMPLE_RECEIPT_DATA.invoiceNumber}) — actual receipts pull live order details.
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
  onLogoFile,
  logoUploading,
}: {
  block: ReceiptBlock;
  onChange: (patch: Partial<ReceiptBlock>) => void;
  onLogoFile: (file: File | undefined) => void;
  logoUploading: boolean;
}) {
  const textFieldTypes: ReceiptBlockType[] = [
    "business_name",
    "subtitle",
    "footer_message",
    "custom_text",
  ];

  return (
    <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
      {block.type === "logo_header" && (
        <LogoBlockFields
          block={block}
          onChange={onChange}
          onLogoFile={onLogoFile}
          uploading={logoUploading}
        />
      )}

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
          <div className="w-full sm:w-auto">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Alignment
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["left", "Left"],
                  ["center", "Center"],
                  ["right", "Right"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onChange({ align: value })}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    (block.align ?? "center") === value
                      ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
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

      {block.type === "subtitle" && (
        <div className="mt-3 grid grid-cols-1 gap-2 border-t border-slate-200 pt-3 sm:grid-cols-3">
          {(
            [
              ["showAddress", "Business address"],
              ["showPhone", "Business phone"],
              ["showBranchName", "Branch name"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={block[key] ?? true}
                onChange={(e) => onChange({ [key]: e.target.checked })}
                className="h-4 w-4 accent-emerald-600"
              />
              {label}
            </label>
          ))}
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
              ["showInvoiceNumber", "Invoice No."],
              ["showDateTime", "Date & time"],
              ["showCashier", "Cashier"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={block.metadataFields?.[key] ?? true}
                onChange={(e) =>
                  onChange({
                    metadataFields: {
                      showInvoiceNumber: true,
                      showDateTime: true,
                      showCashier: true,
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

// ─── Logo block: drag-and-drop upload + printer alignment ─────────────────

function LogoBlockFields({
  block,
  onChange,
  onLogoFile,
  uploading,
}: {
  block: ReceiptBlock;
  onChange: (patch: Partial<ReceiptBlock>) => void;
  onLogoFile: (file: File | undefined) => void;
  uploading: boolean;
}) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setIsDraggingOver(false);
    onLogoFile(e.dataTransfer.files?.[0]);
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Logo image</label>
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingOver(true);
          }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={handleDrop}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
            isDraggingOver
              ? "border-emerald-400 bg-emerald-50"
              : "border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/40"
          }`}
        >
          {block.imageKey ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL preview, not a static asset */}
              <img
                src={block.imageKey}
                alt="Logo preview"
                className="max-h-16 max-w-[200px] object-contain"
              />
              <span className="text-xs font-medium text-emerald-700">
                {uploading ? "Uploading…" : "Drag & drop or click to replace"}
              </span>
            </>
          ) : (
            <>
              <span className="text-2xl">🖼</span>
              <span className="text-sm font-medium text-slate-600">
                {uploading ? "Uploading…" : "Drag & drop your logo here, or click to upload"}
              </span>
              <span className="text-xs text-slate-400">PNG or JPG recommended, resized automatically</span>
            </>
          )}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              onLogoFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {block.imageKey && (
          <button
            type="button"
            onClick={() => onChange({ imageKey: null })}
            className="mt-2 text-xs text-red-600 underline hover:text-red-700"
          >
            Remove logo
          </button>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Printer hardware alignment
        </p>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["left", "Left"],
              ["center", "Center"],
              ["right", "Right"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ align: value })}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                (block.align ?? "center") === value
                  ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
