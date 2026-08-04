"use client";

import { useEffect, useRef, useState } from "react";
import type { Product, ProductModifierGroup, SelectedModifier, Unit } from "@repo/types";
import { useAuth } from "../../providers/AuthProvider";
import { fetchProductModifierGroups } from "../../services/products";
import { formatCurrency } from "../../services/sales";

interface ModifierModalProps {
  product: Product;
  quantity: number;
  unit: Unit;
  isOpen: boolean;
  onConfirm: (
    product: Product,
    quantity: number,
    unit: Unit,
    modifiers: SelectedModifier[],
    kitchenNote: string,
  ) => void;
  onCancel: () => void;
}

// A per-group map: groupId → { optionId → quantity chosen (0 = not selected) }
type SelectionMap = Record<string, Record<string, number>>;

function buildLabel(group: ProductModifierGroup, optionLabel: string): string {
  return `${group.name}: ${optionLabel}`;
}

export function ModifierModal({
  product,
  quantity,
  unit,
  isOpen,
  onConfirm,
  onCancel,
}: ModifierModalProps) {
  const { token, tenant } = useAuth();
  const symbol = tenant?.currencySymbol ?? "Rs";

  const [groups, setGroups] = useState<ProductModifierGroup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // selections[groupId][optionId] = quantity (0 means un-selected)
  const [selections, setSelections] = useState<SelectionMap>({});
  const [kitchenNote, setKitchenNote] = useState("");
  const noteRef = useRef<HTMLTextAreaElement>(null);

  // Fetch modifier groups whenever the modal opens for this product
  useEffect(() => {
    if (!isOpen || !token) return;
    setIsLoading(true);
    setLoadError(null);
    setSelections({});
    setKitchenNote("");
    fetchProductModifierGroups(token, product.id)
      .then((fetched) => {
        setGroups(fetched);
        // Pre-select the first option of every required single-select group
        const initial: SelectionMap = {};
        for (const g of fetched) {
          initial[g.id] = {};
          if (g.isRequired && g.selectionType === "single" && g.options.length > 0) {
            initial[g.id]![g.options[0]!.id] = 1;
          }
        }
        setSelections(initial);
      })
      .catch(() => setLoadError("Failed to load customisation options. Please try again."))
      .finally(() => setIsLoading(false));
  }, [isOpen, token, product.id]);

  if (!isOpen) return null;

  // ─── Selection helpers ────────────────────────────────────────────────

  function toggleSingle(groupId: string, optionId: string) {
    setSelections((prev) => {
      const group = prev[groupId] ?? {};
      // Clicking the already-selected option in a non-required group de-selects it
      const alreadySelected = (group[optionId] ?? 0) > 0;
      const isRequired = groups.find((g) => g.id === groupId)?.isRequired ?? false;
      if (alreadySelected && !isRequired) {
        return { ...prev, [groupId]: {} };
      }
      return { ...prev, [groupId]: { [optionId]: 1 } };
    });
  }

  function toggleMulti(groupId: string, optionId: string) {
    setSelections((prev) => {
      const group = prev[groupId] ?? {};
      const current = group[optionId] ?? 0;
      return {
        ...prev,
        [groupId]: { ...group, [optionId]: current > 0 ? 0 : 1 },
      };
    });
  }

  // ─── Validation ───────────────────────────────────────────────────────

  const missingRequired = groups
    .filter((g) => g.isRequired)
    .filter((g) => {
      const sel = selections[g.id] ?? {};
      return !Object.values(sel).some((qty) => qty > 0);
    });

  const canConfirm = missingRequired.length === 0;

  // ─── Build SelectedModifier[] for confirmed selections ────────────────

  function buildSelectedModifiers(): SelectedModifier[] {
    const result: SelectedModifier[] = [];
    for (const group of groups) {
      const sel = selections[group.id] ?? {};
      for (const option of group.options) {
        const qty = sel[option.id] ?? 0;
        if (qty <= 0) continue;
        const freeQty = option.includedFreeQuantity ?? 0;
        const chargeableQty = Math.max(0, qty - freeQty);
        const unitCharge = parseFloat(option.pricePerAdditionalUnit ?? "0");
        const totalCharge = chargeableQty * unitCharge;
        result.push({
          modifierGroupId: group.id,
          modifierOptionId: option.id,
          label: buildLabel(group, option.label),
          quantity: qty,
          unitCharge: unitCharge.toFixed(2),
          totalCharge: totalCharge.toFixed(2),
        });
      }
    }
    return result;
  }

  // ─── Modifier charge preview ──────────────────────────────────────────

  const modifierChargeTotal = groups.reduce((sum, group) => {
    const sel = selections[group.id] ?? {};
    return (
      sum +
      group.options.reduce((gSum, option) => {
        const qty = sel[option.id] ?? 0;
        if (qty <= 0) return gSum;
        const freeQty = option.includedFreeQuantity ?? 0;
        const chargeableQty = Math.max(0, qty - freeQty);
        return gSum + chargeableQty * parseFloat(option.pricePerAdditionalUnit ?? "0");
      }, 0)
    );
  }, 0);

  const baseTotal = quantity * parseFloat(product.currentPrice);
  const grandTotal = baseTotal + modifierChargeTotal;

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{product.name}</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {quantity} {unit.code} · customise your order
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="ml-4 mt-0.5 shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" style={{ scrollbarWidth: "thin" }}>
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <svg className="h-6 w-6 animate-spin text-emerald-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="ml-3 text-sm text-slate-500">Loading options…</span>
            </div>
          )}

          {loadError && (
            <div className="rounded-xl bg-red-50 p-4 text-center text-sm text-red-700">
              {loadError}
            </div>
          )}

          {!isLoading && !loadError && groups.map((group) => {
            const sel = selections[group.id] ?? {};
            const isSingle = group.selectionType === "single";

            return (
              <div key={group.id} className="mb-6 last:mb-2">
                {/* Group header */}
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-800">{group.name}</h3>
                  {group.isRequired ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      Required
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                      Optional
                    </span>
                  )}
                  {!isSingle && (
                    <span className="ml-auto text-xs text-slate-400">Pick any</span>
                  )}
                </div>

                {/* Options */}
                <div className="space-y-2">
                  {group.options.map((option) => {
                    const isSelected = (sel[option.id] ?? 0) > 0;
                    const charge = parseFloat(option.pricePerAdditionalUnit ?? "0");
                    const freeQty = option.includedFreeQuantity ?? 0;
                    const hasCharge = group.isPriced && charge > 0;
                    const showFreeNote = group.isPriced && freeQty > 0;

                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() =>
                          isSingle
                            ? toggleSingle(group.id, option.id)
                            : toggleMulti(group.id, option.id)
                        }
                        className={`flex w-full items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-all ${
                          isSelected
                            ? "border-emerald-500 bg-emerald-50"
                            : "border-slate-200 hover:border-slate-300 bg-white"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {/* Selection indicator */}
                          <div
                            className={`flex h-5 w-5 shrink-0 items-center justify-center transition-colors ${
                              isSingle
                                ? "rounded-full border-2 " +
                                  (isSelected
                                    ? "border-emerald-500 bg-emerald-500"
                                    : "border-slate-300")
                                : "rounded border-2 " +
                                  (isSelected
                                    ? "border-emerald-500 bg-emerald-500"
                                    : "border-slate-300")
                            }`}
                          >
                            {isSelected && (
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-3 w-3 text-white"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-800">{option.label}</p>
                            {showFreeNote && (
                              <p className="text-xs text-slateald-500 text-slate-400">
                                First {freeQty} free
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Price badge */}
                        {hasCharge ? (
                          <span className="ml-4 shrink-0 text-sm font-semibold text-emerald-700">
                            + {formatCurrency(option.pricePerAdditionalUnit, symbol)}
                          </span>
                        ) : group.isPriced ? (
                          <span className="ml-4 shrink-0 text-xs font-medium text-slate-400">
                            Free
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                {/* Required but nothing selected */}
                {group.isRequired && !Object.values(sel).some((q) => q > 0) && (
                  <p className="mt-1.5 text-xs text-red-500">Please select an option</p>
                )}
              </div>
            );
          })}

          {/* Kitchen note — always available */}
          {!isLoading && !loadError && (
            <div className="mt-2 border-t border-slate-100 pt-4">
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Kitchen note
                <span className="ml-1.5 text-xs font-normal text-slate-400">(optional — not printed on customer receipt)</span>
              </label>
              <textarea
                ref={noteRef}
                value={kitchenNote}
                onChange={(e) => setKitchenNote(e.target.value)}
                placeholder='e.g. "extra spicy", "no sauce"'
                rows={2}
                className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        {!isLoading && !loadError && (
          <div className="border-t border-slate-100 px-5 py-4">
            {/* Price summary */}
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-sm text-slate-500">
                {quantity} {unit.code} · base {formatCurrency(baseTotal.toFixed(2), symbol)}
                {modifierChargeTotal > 0 && (
                  <span className="text-emerald-600">
                    {" "}+ {formatCurrency(modifierChargeTotal.toFixed(2), symbol)} extras
                  </span>
                )}
              </span>
              <span className="text-lg font-bold text-slate-900">
                {formatCurrency(grandTotal.toFixed(2), symbol)}
              </span>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canConfirm}
                onClick={() => onConfirm(product, quantity, unit, buildSelectedModifiers(), kitchenNote)}
                className="flex-2 flex-1 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Add to cart
              </button>
            </div>

            {missingRequired.length > 0 && (
              <p className="mt-2 text-center text-xs text-red-500">
                Please complete all required selections above
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
