"use client";

import { useState } from "react";
import type { Product, SelectedModifier, Unit } from "@repo/types";
import { useAuth } from "../../providers/AuthProvider";
import { useI18n } from "../../providers/I18nProvider";
import { formatCurrency } from "../../services/sales";
import { convertQuantity } from "../../utils/unitConversion";
import { ModifierModal } from "../modifiers/ModifierModal";

interface ProductCardProps {
  product: Product;
  onAdd: (
    product: Product,
    quantity: number,
    unit: Unit,
    modifiers?: SelectedModifier[],
    kitchenNote?: string,
  ) => void;
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

  const [quantity, setQuantity] = useState("");

  // Units this specific product is allowed to sell in (owner-configured).
  // Falls back to just its priced unit if none configured yet.
  const availableUnits =
    product.units && product.units.length > 0 ? product.units : [product.unit];
  const [selectedUnit, setSelectedUnit] = useState<Unit>(product.unit);
  const showUnitDropdown = availableUnits.length > 1;

  // Modifier modal state — only used when product.hasModifiers is true
  const [showModifierModal, setShowModifierModal] = useState(false);
  // Captured quantity + unit at the moment the cashier clicked "Add",
  // held here so the modal can display them and pass them back on confirm.
  const [pendingQty, setPendingQty] = useState(0);
  const [pendingUnit, setPendingUnit] = useState<Unit>(product.unit);

  const symbol = tenant?.currencySymbol ?? "Rs";

  const handleUnitChange = (unitId: string) => {
    const next = availableUnits.find((u) => u.id === unitId);
    if (!next) return;
    const current = parseFloat(quantity);
    if (!isNaN(current) && current > 0) {
      const converted = convertQuantity(current, selectedUnit, next);
      setQuantity(String(parseFloat(converted.toFixed(6))));
    }
    setSelectedUnit(next);
  };

  const handleAdd = () => {
    const raw = parseFloat(quantity);
    if (isNaN(raw) || raw <= 0) return;

    if (product.hasModifiers) {
      // Capture current qty + unit, then open the modifier picker.
      // The actual cart.addItem call happens in handleModifierConfirm.
      setPendingQty(raw);
      setPendingUnit(selectedUnit);
      setShowModifierModal(true);
      return;
    }

    // Simple product — add directly
    onAdd(product, raw, selectedUnit);
    setQuantity("");
    setSelectedUnit(product.unit);
  };

  const handleModifierConfirm = (
    _product: Product,
    qty: number,
    unit: Unit,
    modifiers: SelectedModifier[],
    kitchenNote: string,
  ) => {
    onAdd(_product, qty, unit, modifiers, kitchenNote);
    setShowModifierModal(false);
    setQuantity("");
    setSelectedUnit(product.unit);
  };

  // Live equivalent in the product's priced unit, e.g. "0.5 Maund = 20 kg"
  const priceUnitEquivalent =
    selectedUnit.id !== product.unit.id &&
    quantity !== "" &&
    !isNaN(parseFloat(quantity))
      ? convertQuantity(parseFloat(quantity), selectedUnit, product.unit)
      : null;

  return (
    <>
      <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
        <div className="h-44 w-full bg-slate-100">
          <ProductImage src={product.imageKey} alt={product.name} />
        </div>

        <div className="flex flex-1 flex-col p-4">
          <div className="mb-3 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
                {product.token}
              </p>
              {/* Badge shown when this product has customisation options */}
              {product.hasModifiers && (
                <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                  Customisable
                </span>
              )}
            </div>
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
                placeholder="Enter qty"
                onChange={(e) => setQuantity(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                className="w-full rounded-lg border border-slate-200 py-2.5 pl-3 pr-20 text-base outline-none focus:border-emerald-500"
                aria-label={t.pos.quantity}
              />
              {showUnitDropdown ? (
                <select
                  value={selectedUnit.id}
                  onChange={(e) => handleUnitChange(e.target.value)}
                  aria-label="Unit"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 appearance-none rounded-md bg-emerald-100 py-1 pl-2 pr-6 text-xs font-bold text-emerald-700 outline-none hover:bg-emerald-200 transition-colors cursor-pointer bg-[url('data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%23047857%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_0.35rem_center] bg-[length:0.85rem]"
                >
                  {availableUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.code}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
                  {selectedUnit.code}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleAdd}
              disabled={
                quantity === "" ||
                isNaN(parseFloat(quantity)) ||
                parseFloat(quantity) <= 0
              }
              className="shrink-0 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-foreground)] hover:bg-[var(--accent-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {product.hasModifiers ? "Choose" : t.pos.addToCart}
            </button>
          </div>

          {priceUnitEquivalent !== null && (
            <p className="mt-1.5 text-xs text-emerald-600">
              = {parseFloat(priceUnitEquivalent.toFixed(3))} {product.unit.code}
            </p>
          )}
        </div>
      </div>

      {/* Modifier picker — rendered outside the card so it overlays the full screen */}
      <ModifierModal
        product={product}
        quantity={pendingQty}
        unit={pendingUnit}
        isOpen={showModifierModal}
        onConfirm={handleModifierConfirm}
        onCancel={() => setShowModifierModal(false)}
      />
    </>
  );
}
