"use client";

import { useState } from "react";
import type { CartLineItem } from "@repo/types";
import { useAuth } from "../../providers/AuthProvider";
import { useI18n } from "../../providers/I18nProvider";
import { formatCurrency } from "../../services/sales";

interface CartItemProps {
  item: CartLineItem;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
}

export function CartItem({ item, onUpdateQuantity, onRemove }: CartItemProps) {
  const { tenant } = useAuth();
  const { t } = useI18n();
  const symbol = tenant?.currencySymbol ?? "Rs";
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [qtyWarning, setQtyWarning] = useState(false);

  const handleQuantityChange = (raw: string) => {
    const qty = parseFloat(raw);
    if (!raw || isNaN(qty) || qty <= 0) {
      // Show warning instead of silently removing
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
      // Auto-reset confirmation after 3 seconds
      setTimeout(() => setConfirmRemove(false), 3000);
    }
  };

  return (
    <div className="flex items-start gap-3 border-b border-slate-100 py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-900">{item.productName}</p>
        <p className="text-xs text-slate-500">
          {formatCurrency(item.rate, symbol)} / {item.unit}
        </p>
        {qtyWarning && (
          <p className="mt-1 text-xs text-red-500">
            Quantity must be greater than 0
          </p>
        )}
      </div>

      <div className="flex flex-col items-end gap-2">
        <input
          type="number"
          min="0.001"
          step="0.001"
          defaultValue={item.quantity}
          key={item.quantity}
          onChange={(e) => handleQuantityChange(e.target.value)}
          className={`w-24 rounded-lg border px-2 py-1.5 text-sm text-end outline-none focus:border-emerald-500 ${
            qtyWarning ? "border-red-400 bg-red-50" : "border-slate-200"
          }`}
          aria-label={t.pos.quantity}
        />
        <p className="text-sm font-semibold text-slate-900">
          {formatCurrency(item.lineTotal, symbol)}
        </p>
        <button
          type="button"
          onClick={handleRemoveClick}
          className={`text-xs font-medium transition-colors ${
            confirmRemove
              ? "text-red-700 underline"
              : "text-red-500 hover:text-red-700"
          }`}
        >
          {confirmRemove ? "Tap again to confirm" : "Remove"}
        </button>
      </div>
    </div>
  );
}
