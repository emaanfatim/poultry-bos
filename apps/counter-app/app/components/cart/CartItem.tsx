"use client";

import { useEffect, useState } from "react";
import type { CartLineItem, Unit } from "@repo/types";
import { useAuth } from "../../providers/AuthProvider";
import { useI18n } from "../../providers/I18nProvider";
import { useUnits } from "../../hooks/useUnits";
import { formatCurrency } from "../../services/sales";

interface CartItemProps {
  item: CartLineItem;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
}

export function CartItem({ item, onUpdateQuantity, onRemove }: CartItemProps) {
  const { tenant } = useAuth();
  const { t } = useI18n();
  const { getSameTypeUnits, convert } = useUnits(true);
  const symbol = tenant?.currencySymbol ?? "Rs";

  const [confirmRemove, setConfirmRemove] = useState(false);
  const [qtyWarning, setQtyWarning] = useState(false);

  // Display unit — start with the product's base unit
  const [displayUnit, setDisplayUnit] = useState<Unit>(item.unit);
  const [rawValue, setRawValue] = useState(String(parseFloat(item.quantity.toString())));

  const availableUnits = getSameTypeUnits(item.unit);
  const showToggle = availableUnits.length > 1;

  // Sync display when item.quantity changes from outside
  useEffect(() => {
    const baseQty = parseFloat(item.quantity.toString());
    const converted = displayUnit.id === item.unit.id
      ? baseQty
      : convert(baseQty, item.unit, displayUnit);
    if (converted !== null && !rawValue.endsWith(".")) {
      setRawValue(String(parseFloat(converted.toFixed(6))));
    }
  }, [item.quantity]);

  const cycleUnit = () => {
    const idx = availableUnits.findIndex((u) => u.id === displayUnit.id);
    const next = availableUnits[(idx + 1) % availableUnits.length]!;
    const current = parseFloat(rawValue);
    if (!isNaN(current)) {
      const converted = convert(current, displayUnit, next);
      if (converted !== null) {
        setRawValue(String(parseFloat(converted.toFixed(6))));
      }
    }
    setDisplayUnit(next);
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

    // Always store in base unit
    const baseQty = displayUnit.id === item.unit.id
      ? qty
      : convert(qty, displayUnit, item.unit) ?? qty;
    onUpdateQuantity(item.productId, baseQty);
  };

  const handleRemoveClick = () => {
    if (confirmRemove) {
      onRemove(item.productId);
    } else {
      setConfirmRemove(true);
      setTimeout(() => setConfirmRemove(false), 3000);
    }
  };

  // Base equivalent hint when showing in non-base unit
  const baseHint = (() => {
    if (displayUnit.id === item.unit.id) return null;
    const raw = parseFloat(rawValue);
    if (isNaN(raw) || raw <= 0) return null;
    const base = convert(raw, displayUnit, item.unit);
    if (base === null) return null;
    return `= ${parseFloat(base.toFixed(4))} ${item.unit.code}`;
  })();

  return (
    <div className="flex items-start gap-3 border-b border-slate-100 py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-900">{item.productName}</p>
        <p className="text-xs text-slate-500">
          {formatCurrency(item.rate, symbol)} / {item.unit.code}
        </p>
        {qtyWarning && (
          <p className="mt-1 text-xs text-red-500">Quantity must be greater than 0</p>
        )}
        {baseHint && (
          <p className="mt-0.5 text-xs text-emerald-600">{baseHint}</p>
        )}
      </div>

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
              title="Toggle unit"
            >
              {displayUnit.code}
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
  );
}
