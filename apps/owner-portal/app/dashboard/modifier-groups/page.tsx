"use client";

import { useEffect, useState } from "react";
import type { ModifierGroup, ModifierSelectionType, Product } from "@repo/types";
import { useAuth } from "../../providers/AuthProvider";
import { AuthGuard } from "../../components/AuthGuard";
import { Header } from "../../components/Header";
import {
  fetchModifierGroups,
  createModifierGroup,
  updateModifierGroup,
  deleteModifierGroup,
  permanentlyDeleteModifierGroup,
  type ModifierGroupPayload,
  type ModifierOptionPayload,
} from "../../services/modifierGroups";
import { fetchProducts } from "../../services/products";
import { ApiError } from "../../services/api";

// ─── Page ────────────────────────────────────────────────────────────────────
//
// One decision the Owner makes when building a modifier, front and center:
//   Priced or Free — does picking an option change the total?
// Options are always a custom, typed-in list (the old "pull live from the
// product catalogue" mode has been removed to keep this simple).
// Everything else (free quantity, max quantity, per-option product link) is
// tucked behind an "Advanced" toggle so the default form stays short.

export default function ModifierGroupsPage() {
  return (
    <AuthGuard>
      <Header />
      <ModifierGroupsPageContent />
    </AuthGuard>
  );
}

function emptyOption(sortOrder: number): ModifierOptionPayload {
  return {
    label: "",
    includedFreeQuantity: 0,
    pricePerAdditionalUnit: "0",
    maxQuantity: null,
    linkedProductId: null,
    sortOrder,
  };
}

function emptyForm(): ModifierGroupPayload {
  return {
    name: "",
    selectionType: "single",
    isRequired: false,
    isPriced: false,
    linkedToSubCategoryId: null,
    options: [emptyOption(0)],
  };
}

function ModifierGroupsPageContent() {
  const { token, user } = useAuth();

  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ModifierGroupPayload>(emptyForm());
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const [groupsData, productsData] = await Promise.all([
        fetchModifierGroups(token, true),
        fetchProducts(token),
      ]);
      setGroups(groupsData);
      setProducts(productsData);
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : "Failed to load modifier groups");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (user?.role !== "owner") {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-slate-500">Access denied — owners only.</p>
      </div>
    );
  }

  // ─── Form helpers ────────────────────────────────────────────────────────

  function updateForm(patch: Partial<ModifierGroupPayload>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function startNew() {
    setEditingId(null);
    setForm(emptyForm());
    setShowAdvanced(false);
    setShowForm(true);
    setError("");
  }

  function startEdit(group: ModifierGroup) {
    setEditingId(group.id);
    setForm({
      name: group.name,
      selectionType: group.selectionType,
      isRequired: group.isRequired,
      isPriced: group.isPriced,
      linkedToSubCategoryId: null,
      // A group that was previously catalogue-linked has no typed-in options
      // of its own — start it with one blank row instead of losing the form.
      options: group.linkedToSubCategoryId
        ? [emptyOption(0)]
        : group.options.map((o, i) => ({
            label: o.label,
            includedFreeQuantity: o.includedFreeQuantity,
            pricePerAdditionalUnit: o.pricePerAdditionalUnit,
            maxQuantity: o.maxQuantity,
            linkedProductId: o.linkedProductId ?? null,
            sortOrder: o.sortOrder ?? i,
          })),
    });
    setShowAdvanced(
      group.options.some((o) => o.includedFreeQuantity > 0 || o.maxQuantity || o.linkedProductId),
    );
    setShowForm(true);
    setError("");
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
  }

  function addOptionRow() {
    setForm((prev) => ({
      ...prev,
      options: [...prev.options, emptyOption(prev.options.length)],
    }));
  }

  function removeOptionRow(index: number) {
    setForm((prev) => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index),
    }));
  }

  function updateOptionRow(index: number, patch: Partial<ModifierOptionPayload>) {
    setForm((prev) => ({
      ...prev,
      options: prev.options.map((o, i) => (i === index ? { ...o, ...patch } : o)),
    }));
  }

  async function submitForm() {
    if (!token) return;
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    const cleanOptions = form.options.filter((o) => o.label.trim());
    if (cleanOptions.length === 0) {
      setError("Add at least one option.");
      return;
    }
    if (form.isPriced) {
      for (const o of cleanOptions) {
        if (!/^\d+(\.\d{1,2})?$/.test(o.pricePerAdditionalUnit || "0")) {
          setError(`"${o.label}" has an invalid price.`);
          return;
        }
      }
    }

    setSaving(true);
    setError("");
    try {
      const payload: ModifierGroupPayload = {
        name: form.name.trim(),
        selectionType: form.selectionType,
        isRequired: form.isRequired,
        isPriced: form.isPriced,
        linkedToSubCategoryId: null,
        options: form.options
          .filter((o) => o.label.trim())
          .map((o, i) => ({
            ...o,
            label: o.label.trim(),
            // Free/Priced is a group-level choice — zero out price when the
            // group is Free so nothing lingers from a prior "Priced" edit.
            pricePerAdditionalUnit: form.isPriced ? o.pricePerAdditionalUnit || "0" : "0",
            sortOrder: i,
          })),
      };

      if (editingId) {
        await updateModifierGroup(token, editingId, payload);
      } else {
        await createModifierGroup(token, payload);
      }
      cancelForm();
      await load();
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : "Failed to save modifier group");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(group: ModifierGroup) {
    if (!token) return;
    setError("");
    try {
      if (group.isActive) {
        await deleteModifierGroup(token, group.id);
      } else {
        await updateModifierGroup(token, group.id, { isActive: true });
      }
      await load();
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : "Failed to update modifier group");
    }
  }

  async function deleteGroup(group: ModifierGroup) {
    if (!token) return;
    const confirmed = window.confirm(
      `Permanently delete "${group.name}"? This can't be undone.`,
    );
    if (!confirmed) return;

    setError("");
    setDeletingId(group.id);
    try {
      await permanentlyDeleteModifierGroup(token, group.id);
      if (editingId === group.id) cancelForm();
      await load();
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : "Failed to delete modifier group");
    } finally {
      setDeletingId(null);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-bold text-slate-900">Modifiers</h1>
          <p className="text-sm text-slate-500">
            Build a customer choice once (Size, Milk, Packaging…), then attach it to whichever
            products need it on the{" "}
            <a href="/dashboard/products" className="font-medium text-emerald-600 hover:underline">
              Products
            </a>{" "}
            page.
          </p>
        </div>
        <button
          type="button"
          onClick={() => (showForm ? cancelForm() : startNew())}
          className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          {showForm ? "Cancel" : "+ New Modifier"}
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Form ── */}
      {showForm && (
        <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-slate-800">
            {editingId ? "Edit Modifier" : "New Modifier"}
          </h2>

          <div className="space-y-5">
            {/* Step 1: basics */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Name</label>
                <input
                  type="text"
                  placeholder="e.g. Size, Milk Type, Packaging"
                  value={form.name}
                  onChange={(e) => updateForm({ name: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Customer can pick
                </label>
                <select
                  value={form.selectionType}
                  onChange={(e) =>
                    updateForm({ selectionType: e.target.value as ModifierSelectionType })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                >
                  <option value="single">One option (e.g. Size)</option>
                  <option value="multi">Multiple / quantities (e.g. Add-ins)</option>
                </select>
              </div>
            </div>

            {/* Step 2: Priced or Free */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500">Pricing</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => updateForm({ isPriced: false })}
                  className={`rounded-lg border p-3 text-left text-sm transition ${
                    !form.isPriced
                      ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  <div className="font-semibold">Free</div>
                  <div className="text-xs text-slate-500">Just a choice — total doesn&apos;t change</div>
                </button>
                <button
                  type="button"
                  onClick={() => updateForm({ isPriced: true })}
                  className={`rounded-lg border p-3 text-left text-sm transition ${
                    form.isPriced
                      ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  <div className="font-semibold">Priced</div>
                  <div className="text-xs text-slate-500">Picking an option changes the total</div>
                </button>
              </div>
            </div>

            {/* Options editor */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-medium text-slate-500">Options</label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="text-xs font-medium text-slate-400 hover:text-slate-600"
                  >
                    {showAdvanced ? "Hide advanced" : "Advanced"}
                  </button>
                  <button
                    type="button"
                    onClick={addOptionRow}
                    className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
                  >
                    + Add option
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {form.options.map((option, i) => (
                  <div key={i} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Label (e.g. Large)"
                        value={option.label}
                        onChange={(e) => updateOptionRow(i, { label: e.target.value })}
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                      />
                      {form.isPriced && (
                        <div className="flex shrink-0 items-center gap-1">
                          <span className="text-xs text-slate-400">Rs</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="0"
                            value={option.pricePerAdditionalUnit}
                            onChange={(e) =>
                              updateOptionRow(i, { pricePerAdditionalUnit: e.target.value })
                            }
                            className="w-24 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                          />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeOptionRow(i)}
                        className="shrink-0 text-xs text-slate-400 hover:text-red-600"
                      >
                        ✕
                      </button>
                    </div>

                    {showAdvanced && (
                      <div className="mt-2 grid grid-cols-1 gap-2 border-t border-slate-100 pt-2 sm:grid-cols-3">
                        {form.isPriced && (
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="Free qty before charging"
                            value={option.includedFreeQuantity}
                            onChange={(e) =>
                              updateOptionRow(i, {
                                includedFreeQuantity: Math.max(
                                  0,
                                  parseInt(e.target.value || "0", 10) || 0,
                                ),
                              })
                            }
                            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                          />
                        )}
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="Max qty (blank = unlimited)"
                          value={option.maxQuantity ?? ""}
                          onChange={(e) =>
                            updateOptionRow(i, {
                              maxQuantity: e.target.value ? parseInt(e.target.value, 10) : null,
                            })
                          }
                          className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                        />
                        {form.isPriced && (
                          <select
                            value={option.linkedProductId ?? ""}
                            onChange={(e) =>
                              updateOptionRow(i, { linkedProductId: e.target.value || null })
                            }
                            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                          >
                            <option value="">No live price link</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                Link: {p.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {showAdvanced && (
                <p className="mt-2 text-xs text-slate-400">
                  Free qty = how many are included before the extra price kicks in. Max qty
                  blank = unlimited. &quot;Link&quot; ties an option&apos;s price live to a real
                  product instead of typing it here.
                </p>
              )}
            </div>

            {/* Required toggle */}
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={form.isRequired}
                onChange={(e) => updateForm({ isRequired: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              Required — customer must choose before checkout
            </label>

            <div>
              <button
                type="button"
                onClick={submitForm}
                disabled={saving}
                className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 sm:w-auto"
              >
                {saving ? "Saving…" : editingId ? "Save Changes" : "Create Modifier"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── List ── */}
      {loading ? (
        <div className="text-center text-slate-400">Loading…</div>
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
          No modifiers yet. Create one above.
        </div>
      ) : (
        <ul className="space-y-3">
          {groups.map((group) => (
            <li
              key={group.id}
              className={`rounded-2xl border bg-white p-4 shadow-sm ${
                group.isActive ? "border-slate-200" : "border-slate-100 opacity-60"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span
                    className={`font-medium ${group.isActive ? "text-slate-900" : "text-slate-400 line-through"}`}
                  >
                    {group.name}
                  </span>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {group.selectionType === "single" ? "Single choice" : "Multi / quantity"}
                  </span>
                  {group.isRequired && (
                    <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                      Required
                    </span>
                  )}
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs ${
                      group.isPriced
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {group.isPriced ? "Priced" : "Free"}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => startEdit(group)}
                    className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(group)}
                    className={`text-xs font-medium ${
                      group.isActive ? "text-red-500 hover:text-red-700" : "text-emerald-600 hover:text-emerald-700"
                    }`}
                  >
                    {group.isActive ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteGroup(group)}
                    disabled={deletingId === group.id}
                    className="text-xs font-medium text-slate-400 hover:text-red-700 disabled:opacity-50"
                  >
                    {deletingId === group.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>

              {group.options.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {group.options.map((o) => (
                    <span
                      key={o.id}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600"
                    >
                      {o.label}
                      {parseFloat(o.pricePerAdditionalUnit) > 0 && (
                        <> · +Rs {o.pricePerAdditionalUnit}</>
                      )}
                      {o.includedFreeQuantity > 0 && <> · {o.includedFreeQuantity} free</>}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}