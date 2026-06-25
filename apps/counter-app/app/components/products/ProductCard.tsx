"use client";

import { useState } from "react";
import type { Product } from "@repo/types";
import { useAuth } from "../../providers/AuthProvider";
import { useI18n } from "../../providers/I18nProvider";
import { formatCurrency } from "../../services/sales";

interface ProductCardProps {
  product: Product;
  onAdd: (product: Product, quantity: number) => void;
}

export function ProductCard({ product, onAdd }: ProductCardProps) {
  const { tenant } = useAuth();
  const { t } = useI18n();
  const [quantity, setQuantity] = useState("1");

  const handleAdd = () => {
    const qty = parseFloat(quantity);
    if (qty > 0) onAdd(product, qty);
  };

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
          {product.token}
        </p>
        <h3 className="mt-1 text-lg font-semibold text-slate-900">{product.name}</h3>
        <p className="mt-1 text-sm text-slate-500">
          {formatCurrency(product.currentPrice, tenant?.currencySymbol ?? "Rs")} {t.pos.perUnit}{" "}
          {product.unit}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="number"
          min="0.001"
          step="0.001"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-base outline-none focus:border-emerald-500"
          aria-label={t.pos.quantity}
        />
        <button
          type="button"
          onClick={handleAdd}
          className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 active:scale-[0.98]"
        >
          {t.pos.addToCart}
        </button>
      </div>
    </div>
  );
}
