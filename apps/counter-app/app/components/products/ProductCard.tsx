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

function ProductImage({ src, alt }: { src: string | null | undefined; alt: string }) {
  const [errored, setErrored] = useState(false);

  if (!src || errored) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-100">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-16 w-16 text-slate-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className="h-full w-full object-cover"
      onError={() => setErrored(true)}
    />
  );
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
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="h-44 w-full bg-slate-100">
        <ProductImage src={product.imageKey} alt={product.name} />
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-3 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
            {product.token}
          </p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">
            {product.name}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {formatCurrency(product.currentPrice, tenant?.currencySymbol ?? "Rs")}{" "}
            {t.pos.perUnit} {product.unit}
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
    </div>
  );
}