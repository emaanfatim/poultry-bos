"use client";

import { useState } from "react";
import type { Unit } from "@repo/types";
import { AuthGuard } from "../../components/common/AuthGuard";
import { Header } from "../../components/common/Header";
import { useAuth } from "../../providers/AuthProvider";
import { useUnits } from "../../hooks/useUnits";

const TYPE_LABELS: Record<string, string> = {
  weight: "Weight",
  volume: "Volume",
  count: "Count",
};

const TYPE_COLORS: Record<string, string> = {
  weight: "bg-blue-50 text-blue-700",
  volume: "bg-purple-50 text-purple-700",
  count: "bg-slate-100 text-slate-700",
};

interface UnitFormData {
  name: string;
  code: string;
  type: "weight" | "volume" | "count";
  isBase: boolean;
  baseUnitId: string;
  conversionFactor: string;
}

const EMPTY_FORM: UnitFormData = {
  name: "",
  code: "",
  type: "weight",
  isBase: false,
  baseUnitId: "",
  conversionFactor: "",
};

export default function UnitsSettingsPage() {
  const { isOwner } = useAuth();
  const { units, isLoading, error, reload, createUnit, updateUnit, toggleUnit } = useUnits();
  const [showForm, setShowForm] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [form, setForm] = useState<UnitFormData>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!isOwner) {
    return (
      <AuthGuard>
        <div className="flex min-h-screen flex-col">
          <Header />
          <main className="mx-auto max-w-3xl p-8 text-center">
            <p className="text-slate-600">Only the owner can manage units.</p>
          </main>
        </div>
      </AuthGuard>
    );
  }

  const baseUnits = units.filter((u) => u.isBase);
  const sameTypeBaseUnits = baseUnits.filter((u) => u.type === form.type);

  const openCreate = () => {
    setEditingUnit(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (unit: Unit) => {
    setEditingUnit(unit);
    setForm({
      name: unit.name,
      code: unit.code,
      type: unit.type,
      isBase: unit.isBase,
      baseUnitId: unit.baseUnitId ?? "",
      conversionFactor: unit.conversionFactor ?? "",
    });
    setFormError(null);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!form.name.trim()) { setFormError("Name is required"); return; }
    if (!editingUnit && !form.code.trim()) { setFormError("Code is required"); return; }
    if (!form.isBase && !form.baseUnitId) { setFormError("Select a base unit to convert into"); return; }
    if (!form.isBase && !form.conversionFactor) { setFormError("Conversion factor is required"); return; }

    setIsSaving(true);
    try {
      if (editingUnit) {
        await updateUnit(editingUnit.id, {
          name: form.name.trim(),
          conversionFactor: form.isBase ? null : form.conversionFactor,
        });
      } else {
        await createUnit({
          name: form.name.trim(),
          code: form.code.trim().toLowerCase(),
          type: form.type,
          isBase: form.isBase,
          baseUnitId: form.isBase ? null : form.baseUnitId,
          conversionFactor: form.isBase ? null : form.conversionFactor,
        });
      }
      setShowForm(false);
      setForm(EMPTY_FORM);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save unit");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (unit: Unit) => {
    try {
      await toggleUnit(unit.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to toggle unit");
    }
  };

  const grouped = {
    weight: units.filter((u) => u.type === "weight"),
    volume: units.filter((u) => u.type === "volume"),
    count: units.filter((u) => u.type === "count"),
  };

  return (
    <AuthGuard>
      <div className="flex min-h-screen flex-col bg-slate-50">
        <Header />

        <main className="mx-auto w-full max-w-4xl flex-1 p-4">
          {/* Page header */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Units</h2>
              <p className="text-sm text-slate-500">
                Manage units and conversion factors for your shop
              </p>
            </div>
            <button
              type="button"
              onClick={openCreate}
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              + Add Unit
            </button>
          </div>

          {isLoading && <p className="text-slate-500">Loading...</p>}
          {error && <p className="text-red-600">{error}</p>}

          {/* Units grouped by type */}
          {!isLoading && (Object.entries(grouped) as [string, Unit[]][]).map(([type, typeUnits]) => {
            if (typeUnits.length === 0) return null;
            return (
              <div key={type} className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-4 py-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${TYPE_COLORS[type]}`}>
                    {TYPE_LABELS[type]}
                  </span>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-start font-medium">Name</th>
                      <th className="px-4 py-3 text-start font-medium">Code</th>
                      <th className="px-4 py-3 text-start font-medium">Converts to</th>
                      <th className="px-4 py-3 text-start font-medium">Factor</th>
                      <th className="px-4 py-3 text-center font-medium">Status</th>
                      <th className="px-4 py-3 text-end font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {typeUnits.map((unit) => (
                      <tr key={unit.id} className={`border-t border-slate-100 ${!unit.isActive ? "opacity-50" : ""}`}>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {unit.name}
                          {unit.isBase && (
                            <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
                              base
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-600">{unit.code}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {unit.isBase ? (
                            <span className="text-slate-300">—</span>
                          ) : (
                            unit.baseUnitCode ?? "—"
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {unit.isBase ? (
                            <span className="text-slate-300">—</span>
                          ) : (
                            `1 ${unit.code} = ${unit.conversionFactor} ${unit.baseUnitCode}`
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggle(unit)}
                            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                              unit.isActive
                                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                            }`}
                          >
                            {unit.isActive ? "Active" : "Inactive"}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-end">
                          <button
                            type="button"
                            onClick={() => openEdit(unit)}
                            className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </main>

        {/* Add / Edit modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <h3 className="text-lg font-bold text-slate-900">
                {editingUnit ? `Edit ${editingUnit.name}` : "Add Unit"}
              </h3>

              <div className="mt-4 space-y-4">
                {/* Name */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Display Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Kilogram, Maund, Piece"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400"
                  />
                </div>

                {/* Code — only on create */}
                {!editingUnit && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Code <span className="text-red-500">*</span>
                      <span className="ml-1 text-xs font-normal text-slate-400">lowercase, no spaces</span>
                    </label>
                    <input
                      type="text"
                      value={form.code}
                      onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toLowerCase().replace(/\s/g, "_") }))}
                      placeholder="e.g. kg, maund, piece"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400"
                    />
                  </div>
                )}

                {/* Type — only on create */}
                {!editingUnit && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Type</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["weight", "volume", "count"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, type: t, baseUnitId: "" }))}
                          className={`rounded-xl border-2 py-2 text-sm font-medium transition-all ${
                            form.type === t
                              ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 text-slate-600 hover:border-slate-300"
                          }`}
                        >
                          {TYPE_LABELS[t]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Base unit toggle — only on create */}
                {!editingUnit && (
                  <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
                    <input
                      type="checkbox"
                      id="isBase"
                      checked={form.isBase}
                      onChange={(e) => setForm((f) => ({ ...f, isBase: e.target.checked, baseUnitId: "", conversionFactor: "" }))}
                      className="h-4 w-4 rounded accent-emerald-600"
                    />
                    <label htmlFor="isBase" className="text-sm font-medium text-slate-700">
                      This is a base unit (nothing converts into it)
                    </label>
                  </div>
                )}

                {/* Conversion fields — when not base */}
                {!form.isBase && (
                  <>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">
                        Converts into <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={form.baseUnitId}
                        onChange={(e) => setForm((f) => ({ ...f, baseUnitId: e.target.value }))}
                        disabled={!!editingUnit}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400 disabled:bg-slate-50"
                      >
                        <option value="">Select base unit...</option>
                        {sameTypeBaseUnits.map((u) => (
                          <option key={u.id} value={u.id}>{u.name} ({u.code})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">
                        Conversion factor <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        min="0.000001"
                        step="any"
                        inputMode="decimal"
                        value={form.conversionFactor}
                        onChange={(e) => setForm((f) => ({ ...f, conversionFactor: e.target.value }))}
                        placeholder="e.g. 40 for Maund, 0.001 for Gram"
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400"
                      />
                      {form.conversionFactor && form.code && form.baseUnitId && (
                        <p className="mt-1 text-xs text-emerald-600">
                          1 {form.code} = {form.conversionFactor}{" "}
                          {sameTypeBaseUnits.find((u) => u.id === form.baseUnitId)?.code}
                        </p>
                      )}
                    </div>
                  </>
                )}

                {formError && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>
                )}
              </div>

              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  disabled={isSaving}
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSaving}
                  className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : editingUnit ? "Save Changes" : "Add Unit"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
