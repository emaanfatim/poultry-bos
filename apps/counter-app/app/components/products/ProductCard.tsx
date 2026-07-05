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
    <img src={src} alt={alt} className="h-full w-full object-cover" onError={() => setErrored(true)} />
  );
}

function isKgProduct(unit: string) {
  return unit.toLowerCase() === "kg";
}

export function ProductCard({ product, onAdd }: ProductCardProps) {
  const { tenant } = useAuth();
  const { t } = useI18n();
  const [quantity, setQuantity] = useState("");
  const [inputUnit, setInputUnit] = useState<"kg" | "g">("kg");

  const showToggle = isKgProduct(product.unit);

  const handleToggleUnit = () => {
    const current = parseFloat(quantity);
    if (isNaN(current) || quantity === "") {
      setInputUnit((u) => (u === "kg" ? "g" : "kg"));
      return;
    }
    if (inputUnit === "kg") {
      setQuantity(String(Math.round(current * 1000)));
      setInputUnit("g");
    } else {
      setQuantity(String(parseFloat((current / 1000).toFixed(3))));
      setInputUnit("kg");
    }
  };

  const handleAdd = () => {
    const raw = parseFloat(quantity);
    if (isNaN(raw) || raw <= 0) return;
    const qtyInKg = showToggle && inputUnit === "g" ? raw / 1000 : raw;
    onAdd(product, qtyInKg);
    setQuantity("");
    setInputUnit("kg");
  };

  const kgEquivalent =
    showToggle && inputUnit === "g" && quantity !== "" && !isNaN(parseFloat(quantity))
      ? parseFloat((parseFloat(quantity) / 1000).toFixed(3))
      : null;

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
          <h3 className="mt-1 text-lg font-semibold text-slate-900">{product.name}</h3>
          <p className="mt-1 text-sm text-slate-500">
            {formatCurrency(product.currentPrice, tenant?.currencySymbol ?? "Rs")}{" "}
            {t.pos.perUnit} {product.unit}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="number"
              min="0.001"
              step="any"
              inputMode="decimal"
              value={quantity}
              placeholder={showToggle ? `Weight in ${inputUnit}` : `Qty (${product.unit})`}
              onChange={(e) => setQuantity(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="w-full rounded-lg border border-slate-200 py-2.5 pl-3 pr-14 text-base outline-none focus:border-emerald-500"
              aria-label={t.pos.quantity}
            />
            {showToggle ? (
              <button
                type="button"
                onClick={handleToggleUnit}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700 hover:bg-emerald-200 transition-colors"
                title="Toggle between grams and kilograms"
              >
                {inputUnit}
              </button>
            ) : (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
                {product.unit}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleAdd}
            disabled={quantity === "" || isNaN(parseFloat(quantity)) || parseFloat(quantity) <= 0}
            className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t.pos.addToCart}
          </button>
        </div>

        {kgEquivalent !== null && (
          <p className="mt-1.5 text-xs text-emerald-600">= {kgEquivalent} kg</p>
        )}
      </div>
    </div>
  );
}
