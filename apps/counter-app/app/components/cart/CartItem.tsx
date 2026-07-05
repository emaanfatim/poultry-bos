"use client";

import { useEffect, useState } from "react";
import type { CartLineItem } from "@repo/types";
import { useAuth } from "../../providers/AuthProvider";
import { useI18n } from "../../providers/I18nProvider";
import { formatCurrency } from "../../services/sales";

interface CartItemProps {
  item: CartLineItem;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
}

function isKgProduct(unit: string) {
  return unit.toLowerCase() === "kg";
}

function smartDisplay(qtyKg: number): { value: string; unit: "kg" | "g" } {
  if (qtyKg < 1) {
    return { value: String(Math.round(qtyKg * 1000)), unit: "g" };
  }
  return { value: String(parseFloat(qtyKg.toFixed(3))), unit: "kg" };
}

export function CartItem({ item, onUpdateQuantity, onRemove }: CartItemProps) {
  const { tenant } = useAuth();
  const { t } = useI18n();
  const symbol = tenant?.currencySymbol ?? "Rs";
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [qtyWarning, setQtyWarning] = useState(false);

  const showToggle = isKgProduct(item.unit);

  const getDisplay = (qtyKg: number) =>
    showToggle
      ? smartDisplay(qtyKg)
      : { value: String(qtyKg), unit: item.unit as "kg" | "g" };

  const initial = getDisplay(parseFloat(item.quantity.toString()));
  const [cartUnit, setCartUnit] = useState<string>(initial.unit);
  const [rawValue, setRawValue] = useState(initial.value);

  // Sync display when item.quantity changes from outside (e.g. adding more from product card)
  useEffect(() => {
    const qtyKg = parseFloat(item.quantity.toString());
    const display = getDisplay(qtyKg);
    if (!rawValue.endsWith(".")) {
      setCartUnit(display.unit);
      setRawValue(display.value);
    }
  }, [item.quantity]);

  const handleToggleUnit = () => {
    const current = parseFloat(rawValue);
    if (isNaN(current)) {
      setCartUnit((u) => (u === "kg" ? "g" : "kg"));
      return;
    }
    if (cartUnit === "kg") {
      setRawValue(String(Math.round(current * 1000)));
      setCartUnit("g");
    } else {
      setRawValue(String(parseFloat((current / 1000).toFixed(3))));
      setCartUnit("kg");
    }
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
    const qtyInKg = showToggle && cartUnit === "g" ? qty / 1000 : qty;
    onUpdateQuantity(item.productId, qtyInKg);
  };

  const handleRemoveClick = () => {
    if (confirmRemove) {
      onRemove(item.productId);
    } else {
      setConfirmRemove(true);
      setTimeout(() => setConfirmRemove(false), 3000);
    }
  };

  const kgEquivalent =
    showToggle && cartUnit === "g" && rawValue !== "" && !isNaN(parseFloat(rawValue))
      ? parseFloat((parseFloat(rawValue) / 1000).toFixed(3))
      : null;

  return (
    <div className="flex items-start gap-3 border-b border-slate-100 py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-900">{item.productName}</p>
        <p className="text-xs text-slate-500">
          {formatCurrency(item.rate, symbol)} / {item.unit}
        </p>
        {qtyWarning && (
          <p className="mt-1 text-xs text-red-500">Quantity must be greater than 0</p>
        )}
        {kgEquivalent !== null && (
          <p className="mt-0.5 text-xs text-emerald-600">= {kgEquivalent} kg</p>
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
            className={`w-28 rounded-lg border py-1.5 pl-2 pr-10 text-sm text-end outline-none focus:border-emerald-500 ${
              qtyWarning ? "border-red-400 bg-red-50" : "border-slate-200"
            }`}
            aria-label={t.pos.quantity}
          />
          {showToggle ? (
            <button
              type="button"
              onClick={handleToggleUnit}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-bold text-emerald-700 hover:bg-emerald-200 transition-colors"
              title="Toggle between grams and kilograms"
            >
              {cartUnit}
            </button>
          ) : (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">
              {item.unit}
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
