"use client";

import { useEffect, useRef, useState } from "react";
import type { CartLineItem } from "@repo/types";
import { useAuth } from "../../providers/AuthProvider";
import { useI18n } from "../../providers/I18nProvider";
import { formatCurrency } from "../../services/sales";

interface CartItemProps {
  item: CartLineItem;
  onUpdateQuantity: (cartItemId: string, quantity: number) => void;
  onChangeUnit: (cartItemId: string, unit: CartLineItem["unit"]) => void;
  onUpdateKitchenNote: (cartItemId: string, note: string) => void;
  onRemove: (cartItemId: string) => void;
}

export function CartItem({
  item,
  onUpdateQuantity,
  onChangeUnit,
  onUpdateKitchenNote,
  onRemove,
}: CartItemProps) {
  const { tenant } = useAuth();
  const { t } = useI18n();
  const symbol = tenant?.currencySymbol ?? "Rs";

  const [confirmRemove, setConfirmRemove] = useState(false);
  const [qtyWarning, setQtyWarning] = useState(false);
  const [rawValue, setRawValue] = useState(String(parseFloat(item.quantity.toString())));

  // Inline kitchen-note editing
  const [editingNote, setEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState(item.kitchenNote ?? "");
  const noteInputRef = useRef<HTMLInputElement>(null);

  const availableUnits = item.sellableUnits ?? [item.unit];
  const showToggle = availableUnits.length > 1;

  // Sync display when item.quantity changes from outside (e.g. re-added from product card)
  useEffect(() => {
    if (!rawValue.endsWith(".")) {
      setRawValue(String(parseFloat(item.quantity.toString())));
    }
  }, [item.quantity]);

  // Focus the note input as soon as it mounts
  useEffect(() => {
    if (editingNote) noteInputRef.current?.focus();
  }, [editingNote]);

  const cycleUnit = () => {
    const idx = availableUnits.findIndex((u) => u.id === item.unit.id);
    const next = availableUnits[(idx + 1) % availableUnits.length]!;
    onChangeUnit(item.cartItemId, next);
  };

  const handleQuantityChange = (raw: string) => {
    setRawValue(raw);
    if (raw === "" || raw.endsWith(".") || raw === "0") {
      setQtyWarning(raw === "");
      return;
    }
    const qty = parseFloat(raw);
    if (isNaN(qty) || qty <= 0) {
      setQtyWarning(true);
      return;
    }
    setQtyWarning(false);
    onUpdateQuantity(item.cartItemId, qty);
  };

  const handleRemoveClick = () => {
    if (confirmRemove) {
      onRemove(item.cartItemId);
    } else {
      setConfirmRemove(true);
      setTimeout(() => setConfirmRemove(false), 3000);
    }
  };

  const commitNote = () => {
    onUpdateKitchenNote(item.cartItemId, noteValue);
    setEditingNote(false);
  };

  const hasModifiers = item.modifiers && item.modifiers.length > 0;
  const modifierTotalNum = parseFloat(item.modifierTotal ?? "0");

  return (
    <div className="border-b border-slate-100 py-3 last:border-0">
      <div className="flex items-start gap-3">
        {/* Left: name + rate + modifiers + note */}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900">{item.productName}</p>
          <p className="text-xs text-slate-500">
            {formatCurrency(item.rate, symbol)} / {item.unit.code}
          </p>

          {/* Selected modifiers */}
          {hasModifiers && (
            <ul className="mt-1.5 space-y-0.5">
              {item.modifiers!.map((mod) => (
                <li key={`${mod.modifierGroupId}-${mod.modifierOptionId}`} className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500">{mod.label}</span>
                  {parseFloat(mod.totalCharge) > 0 && (
                    <span className="text-xs font-medium text-emerald-600">
                      +{formatCurrency(mod.totalCharge, symbol)}
                    </span>
                  )}
                </li>
              ))}
              {modifierTotalNum > 0 && (
                <li className="text-xs font-semibold text-emerald-700">
                  Extras: +{formatCurrency(item.modifierTotal!, symbol)}
                </li>
              )}
            </ul>
          )}

          {/* Kitchen note */}
          {editingNote ? (
            <div className="mt-1.5 flex items-center gap-1.5">
              <input
                ref={noteInputRef}
                type="text"
                value={noteValue}
                onChange={(e) => setNoteValue(e.target.value)}
                onBlur={commitNote}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitNote();
                  if (e.key === "Escape") {
                    setNoteValue(item.kitchenNote ?? "");
                    setEditingNote(false);
                  }
                }}
                placeholder='e.g. "extra spicy"'
                className="w-full rounded-lg border border-violet-300 bg-violet-50 px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-200"
              />
            </div>
          ) : item.kitchenNote ? (
            <button
              type="button"
              onClick={() => setEditingNote(true)}
              className="mt-1 flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800"
              title="Click to edit kitchen note"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
                <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
              </svg>
              <span className="italic">{item.kitchenNote}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setEditingNote(true)}
              className="mt-1 text-xs text-slate-400 hover:text-violet-600"
            >
              + Add kitchen note
            </button>
          )}

          {qtyWarning && (
            <p className="mt-1 text-xs text-red-500">Quantity must be greater than 0</p>
          )}
        </div>

        {/* Right: qty input + unit toggle + total + remove */}
        <div className="flex flex-col items-end gap-2">
          <div className="relative">
            <input
              type="number"
              min="0.001"
              step="any"
              inputMode="decimal"
              value={rawValue}
              onChange={(e) => handleQuantityChange(e.target.value)}
              className={`w-28 rounded-lg border py-1.5 pl-2 pr-14 text-sm text-end outline-none focus:border-emerald-500 ${
                qtyWarning ? "border-red-400 bg-red-50" : "border-slate-200"
              }`}
              aria-label={t.pos.quantity}
            />
            {showToggle ? (
              <button
                type="button"
                onClick={cycleUnit}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-bold text-emerald-700 hover:bg-emerald-200 transition-colors"
                title={`Switch unit (${availableUnits.map((u) => u.code).join(" → ")})`}
              >
                {item.unit.code}
              </button>
            ) : (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                {item.unit.code}
              </span>
            )}
          </div>

          <p className="text-sm font-semibold text-slate-900">
            {formatCurrency(item.lineTotal, symbol)}
          </p>

          <button
            type="button"
            onClick={handleRemoveClick}
            className={`text-xs font-medium transition-colors ${
              confirmRemove ? "text-red-700 underline" : "text-red-500 hover:text-red-700"
            }`}
          >
            {confirmRemove ? "Tap again to confirm" : "Remove"}
          </button>
        </div>
      </div>
    </div>
  );
}
