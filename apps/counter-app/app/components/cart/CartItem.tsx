"use client";

import { useEffect, useState } from "react";
import type { CartLineItem } from "@repo/types";
import { useAuth } from "../../providers/AuthProvider";
import { useI18n } from "../../providers/I18nProvider";
import { formatCurrency } from "../../services/sales";

interface CartItemProps {
  item: CartLineItem;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onChangeUnit: (productId: string, unit: CartLineItem["unit"]) => void;
  onRemove: (productId: string) => void;
}

export function CartItem({ item, onUpdateQuantity, onChangeUnit, onRemove }: CartItemProps) {
  const { tenant } = useAuth();
  const { t } = useI18n();
  const symbol = tenant?.currencySymbol ?? "Rs";

  const [confirmRemove, setConfirmRemove] = useState(false);
  const [qtyWarning, setQtyWarning] = useState(false);
  const [rawValue, setRawValue] = useState(String(parseFloat(item.quantity.toString())));

  const availableUnits = item.sellableUnits ?? [item.unit];
  const showToggle = availableUnits.length > 1;

  // Sync display when item.quantity changes from outside (e.g. re-added from product card)
  useEffect(() => {
    if (!rawValue.endsWith(".")) {
      setRawValue(String(parseFloat(item.quantity.toString())));
    }
  }, [item.quantity]);

  const cycleUnit = () => {
    const idx = availableUnits.findIndex((u) => u.id === item.unit.id);
    const next = availableUnits[(idx + 1) % availableUnits.length]!;
    onChangeUnit(item.productId, next);
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
    onUpdateQuantity(item.productId, qty);
  };

  const handleRemoveClick = () => {
    if (confirmRemove) {
      onRemove(item.productId);
    } else {
      setConfirmRemove(true);
      setTimeout(() => setConfirmRemove(false), 3000);
    }
  };

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
  );
}
