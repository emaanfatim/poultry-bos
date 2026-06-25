"use client";

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

  return (
    <div className="flex items-start gap-3 border-b border-slate-100 py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-900">{item.productName}</p>
        <p className="text-xs text-slate-500">
          {formatCurrency(item.rate, symbol)} / {item.unit}
        </p>
      </div>
      <div className="flex flex-col items-end gap-2">
        <input
          type="number"
          min="0.001"
          step="0.001"
          value={item.quantity}
          onChange={(e) => onUpdateQuantity(item.productId, parseFloat(e.target.value) || 0)}
          className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-end outline-none focus:border-emerald-500"
          aria-label={t.pos.quantity}
        />
        <p className="text-sm font-semibold text-slate-900">
          {formatCurrency(item.lineTotal, symbol)}
        </p>
        <button
          type="button"
          onClick={() => onRemove(item.productId)}
          className="text-xs text-red-600 hover:underline"
        >
          Remove
        </button>
      </div>
    </div>
  );
}
