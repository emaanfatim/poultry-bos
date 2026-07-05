"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Product, Unit } from "@repo/types";
import { AuthGuard } from "../components/common/AuthGuard";
import { Header } from "../components/common/Header";
import { useAuth } from "../providers/AuthProvider";
import { useI18n } from "../providers/I18nProvider";
import { useUnits } from "../hooks/useUnits";
import { fetchProducts, setProductSellableUnits, updatePrices } from "../services/products";

export default function PricesPage() {
  const { token, isOwner } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const { units } = useUnits(true);

  const [originalPrices, setOriginalPrices] = useState<Record<string, string>>({});
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [editingUnitsFor, setEditingUnitsFor] = useState<string | null>(null);

  const load = () => {
    if (!token) return;
    setIsLoading(true);
    fetchProducts(token)
      .then((data) => {
        setProducts(data);
        const priceMap = Object.fromEntries(data.map((p) => [p.id, p.currentPrice]));
        setPrices(priceMap);
        setOriginalPrices(priceMap);
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    if (!isOwner) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isOwner]);

  if (!isOwner) {
    return (
      <AuthGuard>
        <div className="flex min-h-screen flex-col">
          <Header />
          <main className="mx-auto max-w-3xl p-8 text-center">
            <p className="text-slate-600">{t.prices.ownerOnly}</p>
            <button
              type="button"
              onClick={() => router.push("/pos")}
              className="mt-4 text-emerald-700 underline"
            >
              {t.common.back}
            </button>
          </main>
        </div>
      </AuthGuard>
    );
  }

  const changedProducts = products.filter(
    (p) => prices[p.id] !== originalPrices[p.id]
  );
  const hasChanges = changedProducts.length > 0;

  const handleSave = async () => {
    if (!token || !hasChanges) return;
    setIsSaving(true);
    setMessage(null);
    try {
      await updatePrices(
        token,
        changedProducts.map((p) => ({
          productId: p.id,
          currentPrice: prices[p.id] ?? p.currentPrice,
        })),
      );
      setOriginalPrices({ ...prices });
      setMessage(
        `${t.prices.saved} (${changedProducts.length} product${changedProducts.length !== 1 ? "s" : ""} updated)`
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t.common.error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AuthGuard>
      <div className="flex min-h-screen flex-col">
        <Header />

        <main className="mx-auto w-full max-w-5xl flex-1 p-4">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-900">{t.prices.title}</h2>
            <p className="text-slate-600">{t.prices.subtitle}</p>
          </div>

          {isLoading ? (
            <p>{t.common.loading}</p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium">{t.prices.product}</th>
                    <th className="px-4 py-3 text-start font-medium">{t.prices.unit}</th>
                    <th className="px-4 py-3 text-start font-medium">Sellable units</th>
                    <th className="px-4 py-3 text-end font-medium">{t.prices.price}</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    const changed = prices[product.id] !== originalPrices[product.id];
                    return (
                      <ProductRow
                        key={product.id}
                        product={product}
                        units={units}
                        token={token}
                        changed={changed}
                        priceValue={prices[product.id] ?? product.currentPrice}
                        editing={editingUnitsFor === product.id}
                        onEditUnits={() => setEditingUnitsFor(product.id)}
                        onCancelEditUnits={() => setEditingUnitsFor(null)}
                        onUnitsSaved={() => {
                          setEditingUnitsFor(null);
                          load();
                        }}
                        onPriceChange={(value) => {
                          setMessage(null);
                          setPrices((prev) => ({ ...prev, [product.id]: value }));
                        }}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex items-center gap-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || isLoading || !hasChanges}
              className="rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving
                ? t.prices.saving
                : hasChanges
                  ? `${t.prices.save} (${changedProducts.length})`
                  : t.prices.save}
            </button>
            {message && (
              <p className={`text-sm ${message.includes("updated") ? "text-emerald-700" : "text-red-600"}`}>
                {message}
              </p>
            )}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}

function ProductRow({
  product,
  units,
  token,
  changed,
  priceValue,
  editing,
  onEditUnits,
  onCancelEditUnits,
  onUnitsSaved,
  onPriceChange,
}: {
  product: Product;
  units: Unit[];
  token: string | null;
  changed: boolean;
  priceValue: string;
  editing: boolean;
  onEditUnits: () => void;
  onCancelEditUnits: () => void;
  onUnitsSaved: () => void;
  onPriceChange: (value: string) => void;
}) {
  const currentUnits = product.units && product.units.length > 0 ? product.units : [product.unit];
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(currentUnits.map((u) => u.id)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const compatibleUnits = units.filter((u) => {
    if (u.type !== product.unit.type) return false;
    const baseOf = (unit: Unit) => unit.baseUnitId ?? unit.id;
    return baseOf(u) === baseOf(product.unit);
  });

  const toggleUnit = (id: string) => {
    if (id === product.unit.id) return; // priced unit is always included
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      await setProductSellableUnits(token, product.id, Array.from(selectedIds));
      onUnitsSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className={`border-t border-slate-100 ${changed ? "bg-amber-50" : editing ? "bg-emerald-50/40" : ""}`}>
      <td className="px-4 py-3 font-medium text-slate-900 align-top">
        {product.name}
        {changed && (
          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
            changed
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-slate-600 align-top">
        {product.unit.name} ({product.unit.code})
      </td>
      <td className="px-4 py-3 align-top">
        {editing ? (
          <div>
            <div className="flex flex-wrap gap-2">
              {compatibleUnits
                .filter((u) => u.isActive)
                .map((u) => (
                  <label
                    key={u.id}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(u.id)}
                      disabled={u.id === product.unit.id}
                      onChange={() => toggleUnit(u.id)}
                    />
                    {u.name}
                  </label>
                ))}
            </div>
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={onCancelEditUnits}
                className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {currentUnits.map((u) => (
              <span key={u.id} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                {u.name}
              </span>
            ))}
            <button
              type="button"
              onClick={onEditUnits}
              className="ml-1 text-xs font-medium text-emerald-600 hover:text-emerald-700"
            >
              Edit
            </button>
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-end align-top">
        <input
          type="number"
          min="0"
          step="0.01"
          value={priceValue}
          onChange={(e) => onPriceChange(e.target.value)}
          className={`w-32 rounded-lg border px-3 py-2 text-end outline-none focus:border-emerald-500 ${
            changed ? "border-amber-400" : "border-slate-200"
          }`}
        />
      </td>
    </tr>
  );
}
