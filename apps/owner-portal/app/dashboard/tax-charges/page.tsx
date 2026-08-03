"use client";

import { useEffect, useMemo, useState } from "react";
import type { Product } from "@repo/types";
import { useAuth } from "../../providers/AuthProvider";
import { AuthGuard } from "../../components/AuthGuard";
import { Header } from "../../components/Header";
import { fetchProducts } from "../../services/products";
import { fetchProductCategories } from "../../services/productCategories";
import {
  fetchPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
} from "../../services/paymentMethods";
import {
  fetchChargeCategories,
  createChargeCategory,
  updateChargeCategory,
  deactivateChargeCategory,
  fetchAssignments,
  createAssignment,
  deleteAssignment,
} from "../../services/charges";
import type {
  AssignmentLevel,
  ChargeAssignment,
  ChargeCategory,
  ChargeCategoryPayload,
  ChargeCategoryType,
  ChargeRateLine,
  OverrideType,
  PaymentMethod,
  ProductCategoryLite,
} from "../../types/charges";

// ─── Page shell ──────────────────────────────────────────────────────────────

export default function TaxChargesPage() {
  return (
    <AuthGuard>
      <Header />
      <TaxChargesContent />
    </AuthGuard>
  );
}

function emptyRateLine(): ChargeRateLine {
  return {
    calculationType: "percentage",
    value: "",
    scope: "whole_bill",
    conditionType: "default",
    conditionPaymentMethodId: null,
    manualSelectionLabel: null,
    dependsOnChargeCategoryId: null,
  };
}

function emptyForm(): ChargeCategoryPayload {
  return {
    branchId: null,
    name: "",
    nameSecondaryLanguage: null,
    categoryType: "tax",
    isRegulatoryReportable: false,
    regulatoryAuthorityName: null,
    countsTowardOtherBases: false,
    refundableOnReturn: true,
    rateLines: [emptyRateLine()],
  };
}

function TaxChargesContent() {
  const { token, user, branch } = useAuth();

  const [categories, setCategories] = useState<ChargeCategory[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [productCategories, setProductCategories] = useState<ProductCategoryLite[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null); // null = not editing, "new" = creating
  const [form, setForm] = useState<ChargeCategoryPayload>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [expandedAssignmentsFor, setExpandedAssignmentsFor] = useState<string | null>(null);

  async function loadAll() {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const [cats, methods, prodCats, prods] = await Promise.all([
        fetchChargeCategories(token, branch?.id ?? null),
        fetchPaymentMethods(token, true),
        fetchProductCategories(token),
        fetchProducts(token),
      ]);
      setCategories(cats);
      setPaymentMethods(methods);
      setProductCategories(prodCats);
      setProducts(prods);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Non-tax categories other than the one being edited — the only valid
  // dependsOnChargeCategoryId targets (tax can never be depended on, §5).
  // Computed unconditionally (before the owner-only early return below) so
  // hook call order never varies between renders.
  const dependencyOptions = useMemo(
    () => categories.filter((c) => c.categoryType !== "tax" && c.id !== editingId),
    [categories, editingId],
  );

  if (user?.role !== "owner") {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-slate-500">Access denied — owners only.</p>
      </div>
    );
  }

  // ─── Category form actions ────────────────────────────────────────────────

  function startCreate() {
    setEditingId("new");
    setForm(emptyForm());
    setFormError("");
  }

  function startEdit(cat: ChargeCategory) {
    setEditingId(cat.id);
    setForm({
      branchId: cat.branchId,
      name: cat.name,
      nameSecondaryLanguage: cat.nameSecondaryLanguage,
      categoryType: cat.categoryType,
      isRegulatoryReportable: cat.isRegulatoryReportable,
      regulatoryAuthorityName: cat.regulatoryAuthorityName,
      countsTowardOtherBases: cat.countsTowardOtherBases,
      refundableOnReturn: cat.refundableOnReturn,
      rateLines: cat.rateLines.map((rl) => ({ ...rl })),
    });
    setFormError("");
  }

  function cancelForm() {
    setEditingId(null);
    setForm(emptyForm());
    setFormError("");
  }

  function updateRateLine(index: number, patch: Partial<ChargeRateLine>) {
    setForm((prev) => ({
      ...prev,
      rateLines: prev.rateLines.map((rl, i) => (i === index ? { ...rl, ...patch } : rl)),
    }));
  }

  function addRateLine() {
    setForm((prev) => ({ ...prev, rateLines: [...prev.rateLines, emptyRateLine()] }));
  }

  function removeRateLine(index: number) {
    setForm((prev) => ({ ...prev, rateLines: prev.rateLines.filter((_, i) => i !== index) }));
  }

  async function handleSave() {
    if (!token) return;
    setFormError("");

    if (!form.name.trim()) {
      setFormError("Name is required");
      return;
    }
    if (form.rateLines.length === 0) {
      setFormError("At least one rate line is required");
      return;
    }
    const defaults = form.rateLines.filter((rl) => rl.conditionType === "default");
    if (defaults.length > 1) {
      setFormError("Only one rate line can be set as the default (fallback) line");
      return;
    }
    for (const rl of form.rateLines) {
      if (rl.value === "" || Number.isNaN(parseFloat(rl.value))) {
        setFormError("Every rate line needs a numeric value");
        return;
      }
      if (rl.conditionType === "payment_method" && !rl.conditionPaymentMethodId) {
        setFormError("Select a payment method for every payment-method-conditioned rate line");
        return;
      }
      if (rl.conditionType === "manual_selection" && !rl.manualSelectionLabel?.trim()) {
        setFormError("Enter a label for every manual-selection rate line");
        return;
      }
    }

    setSaving(true);
    try {
      const payload: ChargeCategoryPayload = {
        ...form,
        // A tax category can never count toward another category's base —
        // mirrored client-side; the API structurally forces this too.
        countsTowardOtherBases:
          form.categoryType === "tax" ? false : form.countsTowardOtherBases,
      };

      if (editingId === "new") {
        await createChargeCategory(token, payload);
      } else if (editingId) {
        await updateChargeCategory(token, editingId, payload);
      }
      cancelForm();
      await loadAll();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(cat: ChargeCategory) {
    if (!token) return;
    if (!confirm(`Deactivate "${cat.name}"? Historical bills keep their original figures.`)) {
      return;
    }
    setError("");
    try {
      await deactivateChargeCategory(token, cat.id);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to deactivate");
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Tax & Charges</h1>
      <p className="mb-8 text-sm text-slate-500">
        Add any tax or extra fee you charge customers — like GST or a delivery fee — and it will
        show up on every bill automatically.
      </p>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <PaymentMethodsPanel
        token={token!}
        paymentMethods={paymentMethods}
        onChanged={loadAll}
      />

      {/* ── Create / Edit form ── */}
      <div className="my-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {editingId === null ? (
          <button
            type="button"
            onClick={startCreate}
            className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            + New Charge Category
          </button>
        ) : (
          <ChargeCategoryFormView
            key={editingId ?? "new"}
            form={form}
            setForm={setForm}
            paymentMethods={paymentMethods}
            dependencyOptions={dependencyOptions}
            branchName={branch?.name}
            isEditing={editingId !== "new"}
            saving={saving}
            error={formError}
            onUpdateRateLine={updateRateLine}
            onAddRateLine={addRateLine}
            onRemoveRateLine={removeRateLine}
            onSave={handleSave}
            onCancel={cancelForm}
          />
        )}
      </div>

      {/* ── Category list ── */}
      {loading ? (
        <div className="text-center text-slate-400">Loading…</div>
      ) : categories.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
          No charge categories yet. Create one above — GST, a card surcharge, a delivery fee,
          anything.
        </div>
      ) : (
        <div className="space-y-4">
          {categories.map((cat) => (
            <ChargeCategoryCard
              key={cat.id}
              category={cat}
              paymentMethods={paymentMethods}
              productCategories={productCategories}
              products={products}
              branch={branch}
              token={token!}
              assignmentsOpen={expandedAssignmentsFor === cat.id}
              onToggleAssignments={() =>
                setExpandedAssignmentsFor((prev) => (prev === cat.id ? null : cat.id))
              }
              onEdit={() => startEdit(cat)}
              onDeactivate={() => handleDeactivate(cat)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Payment methods mini-manager ──────────────────────────────────────────
// Needed here because a rate line's "payment_method" condition (e.g. a lower
// tax rate on card than cash) picks from this list.

const ROUNDING_LABELS: Record<PaymentMethod["roundingMethod"], string> = {
  exact: "Exact — never round",
  round_up: "Round up",
  round_down: "Round down",
};

function PaymentMethodsPanel({
  token,
  paymentMethods,
  onChanged,
}: {
  token: string;
  paymentMethods: PaymentMethod[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [requiresRounding, setRequiresRounding] = useState(false);
  const [roundingMethod, setRoundingMethod] = useState<PaymentMethod["roundingMethod"]>("exact");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savingRoundingFor, setSavingRoundingFor] = useState<string | null>(null);

  async function handleAdd() {
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      await createPaymentMethod(token, {
        name: name.trim(),
        requiresRounding,
        roundingMethod: requiresRounding ? roundingMethod : "exact",
      });
      setName("");
      setRequiresRounding(false);
      setRoundingMethod("exact");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add payment method");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(pm: PaymentMethod) {
    setError("");
    try {
      await updatePaymentMethod(token, pm.id, { isActive: !pm.isActive });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update payment method");
    }
  }

  async function changeRoundingMethod(pm: PaymentMethod, method: PaymentMethod["roundingMethod"]) {
    setError("");
    setSavingRoundingFor(pm.id);
    try {
      await updatePaymentMethod(token, pm.id, { roundingMethod: method });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update rounding rule");
    } finally {
      setSavingRoundingFor(null);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <h2 className="text-base font-semibold text-slate-800">Payment Methods</h2>
          <p className="text-xs text-slate-400">
            {paymentMethods.filter((p) => p.isActive).length} active — used at checkout, and as
            the condition options for payment-method-specific rates below.
          </p>
        </div>
        <span className="text-sm text-slate-400">{open ? "Hide" : "Manage"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {paymentMethods.length > 0 && (
            <ul className="space-y-1.5">
              {paymentMethods.map((pm) => (
                <li
                  key={pm.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
                >
                  <span className="text-sm text-slate-800">
                    {pm.name}
                    {!pm.isActive && (
                      <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                        inactive
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    {pm.requiresRounding && (
                      <select
                        value={pm.roundingMethod}
                        disabled={savingRoundingFor === pm.id}
                        onChange={(e) =>
                          changeRoundingMethod(
                            pm,
                            e.target.value as PaymentMethod["roundingMethod"],
                          )
                        }
                        className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 outline-none focus:border-amber-400 disabled:opacity-50"
                      >
                        {(Object.keys(ROUNDING_LABELS) as PaymentMethod["roundingMethod"][]).map(
                          (m) => (
                            <option key={m} value={m}>
                              {ROUNDING_LABELS[m]}
                            </option>
                          ),
                        )}
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleActive(pm)}
                      className="text-xs font-medium text-slate-500 hover:text-slate-800"
                    >
                      {pm.isActive ? "Deactivate" : "Reactivate"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <input
              type="text"
              placeholder="e.g. Cash, Card, JazzCash"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={requiresRounding}
                onChange={(e) => setRequiresRounding(e.target.checked)}
                className="h-4 w-4 accent-emerald-600"
              />
              Requires cash rounding
            </label>
            {requiresRounding && (
              <select
                value={roundingMethod}
                onChange={(e) =>
                  setRoundingMethod(e.target.value as PaymentMethod["roundingMethod"])
                }
                className="rounded-lg border border-slate-200 px-2 py-2 text-xs outline-none focus:border-emerald-400"
              >
                {(Object.keys(ROUNDING_LABELS) as PaymentMethod["roundingMethod"][]).map((m) => (
                  <option key={m} value={m}>
                    {ROUNDING_LABELS[m]}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving || !name.trim()}
              className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
            >
              {saving ? "Adding…" : "Add"}
            </button>
          </div>
          {paymentMethods.some((pm) => pm.requiresRounding) && (
            <p className="text-xs text-slate-400">
              This rule is applied automatically at checkout — the cashier no longer picks it.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Charge category form (create + edit share this) ──────────────────────

const TYPE_INFO: Record<ChargeCategoryType, { label: string; hint: string }> = {
  tax: { label: "Tax", hint: "A government tax, like GST or VAT." },
  surcharge: { label: "Extra fee (surcharge)", hint: "A fee you charge, like a delivery or card fee." },
  other: { label: "Other charge", hint: "Anything else that doesn't fit tax or a fee." },
};

// True once a category is using anything beyond "one flat rate on every sale" —
// used to auto-open Advanced when editing a category that already relies on it,
// so nothing is silently hidden from someone who set it up.
function usesAdvancedFeatures(form: ChargeCategoryPayload): boolean {
  return (
    form.rateLines.length > 1 ||
    form.rateLines.some((rl) => rl.conditionType !== "default" || !!rl.dependsOnChargeCategoryId) ||
    !!form.nameSecondaryLanguage ||
    !!form.isRegulatoryReportable ||
    !!form.countsTowardOtherBases
  );
}

function ChargeCategoryFormView({
  form,
  setForm,
  paymentMethods,
  dependencyOptions,
  branchName,
  isEditing,
  saving,
  error,
  onUpdateRateLine,
  onAddRateLine,
  onRemoveRateLine,
  onSave,
  onCancel,
}: {
  form: ChargeCategoryPayload;
  setForm: React.Dispatch<React.SetStateAction<ChargeCategoryPayload>>;
  paymentMethods: PaymentMethod[];
  dependencyOptions: ChargeCategory[];
  branchName?: string;
  isEditing: boolean;
  saving: boolean;
  error: string;
  onUpdateRateLine: (index: number, patch: Partial<ChargeRateLine>) => void;
  onAddRateLine: () => void;
  onRemoveRateLine: (index: number) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  // Remounted (via `key`) whenever the user switches which category they're
  // editing, so this always starts correctly open/closed for THAT category.
  const [advancedOpen, setAdvancedOpen] = useState(() => usesAdvancedFeatures(form));

  const firstLine = form.rateLines[0];
  const simpleRateEditable = form.rateLines.length === 1 && firstLine?.conditionType === "default";

  return (
    <div>
      <h2 className="mb-4 text-base font-semibold text-slate-800">
        {isEditing ? "Edit Charge" : "New Tax or Charge"}
      </h2>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Simple, always-visible basics ── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Name</label>
          <input
            type="text"
            placeholder="e.g. GST, Card Fee, Delivery Fee"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Type</label>
          <select
            value={form.categoryType}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                categoryType: e.target.value as ChargeCategoryType,
                countsTowardOtherBases:
                  e.target.value === "tax" ? false : prev.countsTowardOtherBases,
              }))
            }
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          >
            {(Object.keys(TYPE_INFO) as ChargeCategoryType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_INFO[t].label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-400">{TYPE_INFO[form.categoryType].hint}</p>
        </div>

        {simpleRateEditable && firstLine && (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Amount</label>
              <div className="flex overflow-hidden rounded-lg border border-slate-200">
                <input
                  type="number"
                  step="0.01"
                  placeholder={firstLine.calculationType === "percentage" ? "e.g. 5" : "e.g. 20"}
                  value={firstLine.value}
                  onChange={(e) => onUpdateRateLine(0, { value: e.target.value })}
                  className="w-full px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-100"
                />
                <select
                  value={firstLine.calculationType}
                  onChange={(e) =>
                    onUpdateRateLine(0, {
                      calculationType: e.target.value as ChargeRateLine["calculationType"],
                    })
                  }
                  className="border-l border-slate-200 bg-slate-50 px-2 text-sm outline-none"
                >
                  <option value="percentage">%</option>
                  <option value="fixed">Rs (flat)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Charged on</label>
              <select
                value={firstLine.scope}
                onChange={(e) =>
                  onUpdateRateLine(0, { scope: e.target.value as ChargeRateLine["scope"] })
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              >
                <option value="whole_bill">The whole bill</option>
                <option value="per_product">Each item</option>
              </select>
            </div>
          </>
        )}

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={!form.branchId}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, branchId: e.target.checked ? null : prev.branchId }))
            }
            className="h-4 w-4 accent-emerald-600"
          />
          Apply to every branch
        </label>
        {form.branchId && (
          <p className="self-center text-xs text-slate-400">
            This will only apply to {branchName ?? "your current branch"}.
          </p>
        )}

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={form.refundableOnReturn ?? true}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, refundableOnReturn: e.target.checked }))
            }
            className="h-4 w-4 accent-emerald-600"
          />
          Refund this if the item is returned
        </label>
      </div>

      {!simpleRateEditable && (
        <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          This charge uses custom rate rules — edit the amount inside{" "}
          <span className="font-medium">Advanced</span> below.
        </p>
      )}

      {/* ── Advanced, collapsed by default ── */}
      <div className="mt-5 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
        >
          <span className={`transition-transform ${advancedOpen ? "rotate-90" : ""}`}>›</span>
          Advanced options
        </button>
        <p className="mt-1 text-xs text-slate-400">
          Most taxes and fees don&apos;t need any of this — it&apos;s here for special cases like
          different rates per payment method, or reporting to a tax authority.
        </p>

        {advancedOpen && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Name in a second language (optional)
                </label>
                <input
                  type="text"
                  value={form.nameSecondaryLanguage ?? ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      nameSecondaryLanguage: e.target.value || null,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <label
                className={`flex items-center gap-2 self-end text-sm ${
                  form.categoryType === "tax" ? "text-slate-300" : "text-slate-600"
                }`}
                title={
                  form.categoryType === "tax"
                    ? "A tax can't be included in another charge's calculation"
                    : undefined
                }
              >
                <input
                  type="checkbox"
                  disabled={form.categoryType === "tax"}
                  checked={form.categoryType === "tax" ? false : form.countsTowardOtherBases ?? false}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, countsTowardOtherBases: e.target.checked }))
                  }
                  className="h-4 w-4 accent-emerald-600 disabled:accent-slate-300"
                />
                Let other charges be calculated on top of this one
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={form.isRegulatoryReportable ?? false}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, isRegulatoryReportable: e.target.checked }))
                  }
                  className="h-4 w-4 accent-emerald-600"
                />
                Reported to a tax authority
              </label>

              {form.isRegulatoryReportable && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Which authority? (e.g. FBR)
                  </label>
                  <input
                    type="text"
                    value={form.regulatoryAuthorityName ?? ""}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        regulatoryAuthorityName: e.target.value || null,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
              )}
            </div>

            {/* ── Custom rate rules ── */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">Custom rate rules</h3>
                <button
                  type="button"
                  onClick={onAddRateLine}
                  className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
                >
                  + Add a rule
                </button>
              </div>
              <p className="mb-3 text-xs text-slate-400">
                Optionally mark one rule as the <span className="font-medium">default</span> — it&apos;s
                used whenever none of the others match. Add more to charge a different rate by
                payment method, or let the cashier pick from a list. If you don&apos;t set a default,
                this charge simply won&apos;t apply when nothing else matches.
              </p>

              <div className="space-y-3">
                {form.rateLines.map((rl, index) => (
                  <div key={index} className="rounded-xl border border-slate-200 p-3">
                    <div className="grid gap-2 sm:grid-cols-4">
                      <select
                        value={rl.calculationType}
                        onChange={(e) =>
                          onUpdateRateLine(index, {
                            calculationType: e.target.value as ChargeRateLine["calculationType"],
                          })
                        }
                        className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-emerald-400"
                      >
                        <option value="percentage">Percentage</option>
                        <option value="fixed">Fixed amount</option>
                      </select>

                      <input
                        type="number"
                        step="0.01"
                        placeholder={rl.calculationType === "percentage" ? "e.g. 5 (%)" : "e.g. 20 (Rs)"}
                        value={rl.value}
                        onChange={(e) => onUpdateRateLine(index, { value: e.target.value })}
                        className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-emerald-400"
                      />

                      <select
                        value={rl.scope}
                        onChange={(e) =>
                          onUpdateRateLine(index, { scope: e.target.value as ChargeRateLine["scope"] })
                        }
                        className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-emerald-400"
                      >
                        <option value="whole_bill">Whole bill</option>
                        <option value="per_product">Per product line</option>
                      </select>

                      <select
                        value={rl.conditionType}
                        onChange={(e) =>
                          onUpdateRateLine(index, {
                            conditionType: e.target.value as ChargeRateLine["conditionType"],
                            conditionPaymentMethodId: null,
                            manualSelectionLabel: null,
                          })
                        }
                        className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-emerald-400"
                      >
                        <option value="default">Default (fallback)</option>
                        <option value="payment_method">By payment method</option>
                        <option value="manual_selection">By manual selection</option>
                      </select>
                    </div>

                    {rl.conditionType === "payment_method" && (
                      <select
                        value={rl.conditionPaymentMethodId ?? ""}
                        onChange={(e) =>
                          onUpdateRateLine(index, { conditionPaymentMethodId: e.target.value || null })
                        }
                        className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-emerald-400"
                      >
                        <option value="">Select payment method…</option>
                        {paymentMethods.map((pm) => (
                          <option key={pm.id} value={pm.id}>
                            {pm.name}
                          </option>
                        ))}
                      </select>
                    )}

                    {rl.conditionType === "manual_selection" && (
                      <input
                        type="text"
                        placeholder="Label the cashier will pick, e.g. Large Box"
                        value={rl.manualSelectionLabel ?? ""}
                        onChange={(e) =>
                          onUpdateRateLine(index, { manualSelectionLabel: e.target.value || null })
                        }
                        className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-emerald-400"
                      />
                    )}

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <select
                        value={rl.dependsOnChargeCategoryId ?? ""}
                        onChange={(e) =>
                          onUpdateRateLine(index, {
                            dependsOnChargeCategoryId: e.target.value || null,
                          })
                        }
                        className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 outline-none focus:border-emerald-400"
                      >
                        <option value="">Calculated from the bill subtotal only</option>
                        {dependencyOptions.map((dep) => (
                          <option key={dep.id} value={dep.id}>
                            Also include: {dep.name}
                          </option>
                        ))}
                      </select>
                      {form.rateLines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => onRemoveRateLine(index)}
                          className="shrink-0 text-xs text-red-500 hover:text-red-700"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : isEditing ? "Save changes" : "Create"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Charge category card (list item + assignments panel) ─────────────────

function ChargeCategoryCard({
  category,
  paymentMethods,
  productCategories,
  products,
  branch,
  token,
  assignmentsOpen,
  onToggleAssignments,
  onEdit,
  onDeactivate,
}: {
  category: ChargeCategory;
  paymentMethods: PaymentMethod[];
  productCategories: ProductCategoryLite[];
  products: Product[];
  branch: { id: string; name: string; token: string } | null;
  token: string;
  assignmentsOpen: boolean;
  onToggleAssignments: () => void;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  const typeBadgeColor =
    category.categoryType === "tax"
      ? "bg-blue-50 text-blue-700"
      : category.categoryType === "surcharge"
        ? "bg-amber-50 text-amber-700"
        : "bg-slate-100 text-slate-600";

  function describeRateLine(rl: ChargeRateLine) {
    const amount =
      rl.calculationType === "percentage" ? `${rl.value}%` : `Rs ${rl.value} flat`;
    const scope = rl.scope === "whole_bill" ? "the whole bill" : "each item";
    if (rl.conditionType === "default") {
      return `${amount} on ${scope}`;
    }
    if (rl.conditionType === "payment_method") {
      const pmName = paymentMethods.find((p) => p.id === rl.conditionPaymentMethodId)?.name ?? "—";
      return `${amount} on ${scope} — only when paying with ${pmName}`;
    }
    return `${amount} on ${scope} — only when cashier picks "${rl.manualSelectionLabel}"`;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
        <div>
          <span className={`mr-2 rounded-md px-2 py-0.5 text-xs font-medium ${typeBadgeColor}`}>
            {category.categoryType}
          </span>
          <span className="font-semibold text-slate-900">{category.name}</span>
          {!category.isActive && (
            <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
              inactive
            </span>
          )}
          {!category.branchId && (
            <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
              tenant-wide
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleAssignments}
            className="text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            {assignmentsOpen ? "Hide where it applies" : "Where does it apply?"}
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
          >
            Edit
          </button>
          {category.isActive && (
            <button
              type="button"
              onClick={onDeactivate}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Deactivate
            </button>
          )}
        </div>
      </div>

      <div className="px-5 py-3">
        <ul className="space-y-1">
          {category.rateLines.map((rl, i) => (
            <li key={rl.id ?? i} className="text-xs text-slate-500">
              {describeRateLine(rl)}
            </li>
          ))}
        </ul>
      </div>

      {assignmentsOpen && (
        <AssignmentsPanel
          category={category}
          productCategories={productCategories}
          products={products}
          branch={branch}
          token={token}
        />
      )}
    </div>
  );
}

// ─── Assignments panel — which branch/category/sub-category/product this
// charge applies to (handover §1's 4-level inheritance) ─────────────────────

function AssignmentsPanel({
  category,
  productCategories,
  products,
  branch,
  token,
}: {
  category: ChargeCategory;
  productCategories: ProductCategoryLite[];
  products: Product[];
  branch: { id: string; name: string; token: string } | null;
  token: string;
}) {
  const [assignments, setAssignments] = useState<ChargeAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [level, setLevel] = useState<AssignmentLevel>("branch");
  const [targetId, setTargetId] = useState("");
  const [overrideType, setOverrideType] = useState<OverrideType>("inherit");
  const [rateOverrideCalculationType, setRateOverrideCalculationType] = useState<
    "fixed" | "percentage"
  >("percentage");
  const [rateOverrideValue, setRateOverrideValue] = useState("");
  const [saving, setSaving] = useState(false);

  const flatSubCategories = useMemo(
    () =>
      productCategories.flatMap((pc) =>
        pc.subCategories.map((sc) => ({ id: sc.id, label: `${sc.name} (${pc.name})` })),
      ),
    [productCategories],
  );

  async function load() {
    setLoading(true);
    setError("");
    try {
      setAssignments(await fetchAssignments(token, category.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load assignments");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category.id]);

  function targetLabel(a: ChargeAssignment) {
    if (a.assignmentLevel === "branch") return branch?.id === a.targetId ? branch.name : a.targetId;
    if (a.assignmentLevel === "product_category") {
      return productCategories.find((pc) => pc.id === a.targetId)?.name ?? a.targetId;
    }
    if (a.assignmentLevel === "product_sub_category") {
      return flatSubCategories.find((sc) => sc.id === a.targetId)?.label ?? a.targetId;
    }
    return products.find((p) => p.id === a.targetId)?.name ?? a.targetId;
  }

  async function handleAdd() {
    if (!targetId) return;
    if (overrideType === "override_rate" && (rateOverrideValue === "" || Number.isNaN(parseFloat(rateOverrideValue)))) {
      setError("Enter a numeric rate for the custom rate override");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await createAssignment(token, {
        chargeCategoryId: category.id,
        assignmentLevel: level,
        targetId,
        overrideType,
        rateOverrideCalculationType: overrideType === "override_rate" ? rateOverrideCalculationType : null,
        rateOverrideValue: overrideType === "override_rate" ? rateOverrideValue : null,
      });
      setTargetId("");
      setOverrideType("inherit");
      setRateOverrideValue("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add assignment");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id: string) {
    setError("");
    try {
      await deleteAssignment(token, id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove assignment");
    }
  }

  return (
    <div className="border-t border-slate-100 bg-slate-50 px-5 py-4">
      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-xs text-slate-400">Loading assignments…</p>
      ) : assignments.length === 0 ? (
        <p className="mb-3 text-xs text-slate-400">
          By default this doesn&apos;t apply to any sale yet. Add a rule below to turn it on for a
          branch, a product category, or a specific product.
        </p>
      ) : (
        <ul className="mb-3 space-y-1.5">
          {assignments.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5"
            >
              <span className="text-xs text-slate-700">
                <span className="mr-1.5 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                  {a.assignmentLevel.replace(/_/g, " ")}
                </span>
                {targetLabel(a)}
                <span className="ml-1.5 text-slate-400">
                  (
                  {a.overrideType === "override_rate"
                    ? `custom rate: ${a.rateOverrideValue}${a.rateOverrideCalculationType === "percentage" ? "%" : ""}`
                    : a.overrideType === "override_on"
                      ? "always charged here"
                      : a.overrideType === "override_off"
                        ? "never charged here"
                        : "default rule"}
                  )
                </span>
              </span>
              <button
                type="button"
                onClick={() => handleRemove(a.id)}
                className="text-xs text-red-400 hover:text-red-600"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={level}
          onChange={(e) => {
            setLevel(e.target.value as AssignmentLevel);
            setTargetId("");
          }}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-emerald-400"
        >
          <option value="branch">Branch</option>
          <option value="product_category">Product category</option>
          <option value="product_sub_category">Product sub-category</option>
          <option value="product">Product</option>
        </select>

        {level === "branch" ? (
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="min-w-[10rem] flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-emerald-400"
          >
            <option value="">Select branch…</option>
            {branch && <option value={branch.id}>{branch.name}</option>}
          </select>
        ) : level === "product_category" ? (
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="min-w-[10rem] flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-emerald-400"
          >
            <option value="">Select category…</option>
            {productCategories.map((pc) => (
              <option key={pc.id} value={pc.id}>
                {pc.name}
              </option>
            ))}
          </select>
        ) : level === "product_sub_category" ? (
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="min-w-[10rem] flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-emerald-400"
          >
            <option value="">Select sub-category…</option>
            {flatSubCategories.map((sc) => (
              <option key={sc.id} value={sc.id}>
                {sc.label}
              </option>
            ))}
          </select>
        ) : (
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="min-w-[10rem] flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-emerald-400"
          >
            <option value="">Select product…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}

        <select
          value={overrideType}
          onChange={(e) => setOverrideType(e.target.value as OverrideType)}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-emerald-400"
        >
          <option value="inherit">Use the default rule</option>
          <option value="override_on">Always charge here</option>
          <option value="override_off">Never charge here</option>
          <option value="override_rate">Different rate here</option>
        </select>

        {overrideType === "override_rate" && (
          <>
            <select
              value={rateOverrideCalculationType}
              onChange={(e) =>
                setRateOverrideCalculationType(e.target.value as "fixed" | "percentage")
              }
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-emerald-400"
            >
              <option value="percentage">%</option>
              <option value="fixed">fixed</option>
            </select>
            <input
              type="number"
              step="0.01"
              value={rateOverrideValue}
              onChange={(e) => setRateOverrideValue(e.target.value)}
              placeholder={rateOverrideCalculationType === "percentage" ? "e.g. 5" : "e.g. 10.00"}
              className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-emerald-400"
            />
          </>
        )}

        <button
          type="button"
          onClick={handleAdd}
          disabled={saving || !targetId}
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add"}
        </button>
      </div>
      {overrideType === "override_rate" && (
        <p className="mt-2 text-xs text-slate-400">
          This target keeps &quot;{category.name}&quot; switched on but bills it at this rate
          instead of the category&apos;s normal rate line(s) — e.g. Tax stays at 15% everywhere
          except this target.
        </p>
      )}
    </div>
  );
}
