"use client";

import { useState } from "react";
import type { Product, Unit } from "@repo/types";
import { useAuth } from "../../providers/AuthProvider";
import { useI18n } from "../../providers/I18nProvider";
import { useUnits } from "../../hooks/useUnits";
import { formatCurrency } from "../../services/sales";

interface ProductCardProps {
  product: Product;
  onAdd: (product: Product, quantity: number, displayUnit: Unit) => void;
}

function ProductImage({ src, alt }: { src: string | null | undefined; alt: string }) {
  const [errored, setErrored] = useState(false);
  if (!src || errored) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-100">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    );
  }
  return <img src={src} alt={alt} className="h-full w-full object-cover" onError={() => setErrored(true)} />;
}

export function ProductCard({ product, onAdd }: ProductCardProps) {
  const { tenant } = useAuth();
  const { t } = useI18n();
  const { getSameTypeUnits, convert } = useUnits(true);

  const [quantity, setQuantity] = useState("");
  // selectedUnit is what the cashier is currently typing in
  const [selectedUnit, setSelectedUnit] = useState<Unit>(product.unit);

  const symbol = tenant?.currencySymbol ?? "Rs";

  // All active units of the same type as this product's base unit
  const availableUnits = getSameTypeUnits(product.unit);
  const showUnitToggle = availableUnits.length > 1;

  const cycleUnit = () => {
    const idx = availableUnits.findIndex((u) => u.id === selectedUnit.id);
    const next = availableUnits[(idx + 1) % availableUnits.length]!;

    // Convert current quantity to new unit
    const current = parseFloat(quantity);
    if (!isNaN(current) && current > 0) {
      const converted = convert(current, selectedUnit, next);
      if (converted !== null) {
        setQuantity(String(parseFloat(converted.toFixed(6)).toString()));
      }
    }
    setSelectedUnit(next);
  };

  // Quantity in base unit (what goes into cart calculations)
  const getBaseQuantity = (): number | null => {
    const raw = parseFloat(quantity);
    if (isNaN(raw) || raw <= 0) return null;
    if (selectedUnit.isBase) return raw;
    return convert(raw, selectedUnit, product.unit) ?? null;
  };

  // Equivalent in base unit shown as hint
  const baseEquivalent = (() => {
    if (selectedUnit.id === product.unit.id) return null;
    const raw = parseFloat(quantity);
    if (isNaN(raw) || raw <= 0 || quantity === "") return null;
    const converted = convert(raw, selectedUnit, product.unit);
    if (converted === null) return null;
    return `= ${parseFloat(converted.toFixed(4))} ${product.unit.code}`;
  })();

  const handleAdd = () => {
    const baseQty = getBaseQuantity();
    if (baseQty === null) return;
    onAdd(product, baseQty, selectedUnit);
    setQuantity("");
    setSelectedUnit(product.unit);
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="h-44 w-full bg-slate-100">
        <ProductImage src={product.imageKey} alt={product.name} />
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-3 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">{product.token}</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">{product.name}</h3>
          <p className="mt-1 text-sm text-slate-500">
            {formatCurrency(product.currentPrice, symbol)} {t.pos.perUnit} {product.unit.code}
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
              placeholder={`Weight in ${selectedUnit.code}`}
              onChange={(e) => setQuantity(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="w-full rounded-lg border border-slate-200 py-2.5 pl-3 pr-16 text-base outline-none focus:border-emerald-500"
              aria-label={t.pos.quantity}
            />
            {showUnitToggle ? (
              <button
                type="button"
                onClick={cycleUnit}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700 hover:bg-emerald-200 transition-colors"
                title={`Switch unit (${availableUnits.map((u) => u.code).join(" → ")})`}
              >
                {selectedUnit.code}
              </button>
            ) : (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
                {selectedUnit.code}
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

        {baseEquivalent && (
          <p className="mt-1.5 text-xs text-emerald-600">{baseEquivalent}</p>
        )}
      </div>
    </div>
  );
}
