"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "../components/common/AuthGuard";
import { Header } from "../components/common/Header";
import { useAuth } from "../providers/AuthProvider";
import { useI18n } from "../providers/I18nProvider";
import { fetchProducts, updatePrices } from "../services/products";

export default function PricesPage() {
  const { token, isOwner } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [originalPrices, setOriginalPrices] = useState<Record<string, string>>({});
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [products, setProducts] = useState<Array<{ id: string; name: string; unit: string; currentPrice: string }>>([]);

  useEffect(() => {
    if (!isOwner) return;
    if (!token) return;

    fetchProducts(token)
      .then((data) => {
        setProducts(data);
        const priceMap = Object.fromEntries(data.map((p) => [p.id, p.currentPrice]));
        setPrices(priceMap);
        setOriginalPrices(priceMap);
      })
      .finally(() => setIsLoading(false));
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

        <main className="mx-auto w-full max-w-4xl flex-1 p-4">
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
                    <th className="px-4 py-3 text-end font-medium">{t.prices.price}</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    const changed = prices[product.id] !== originalPrices[product.id];
                    return (
                      <tr
                        key={product.id}
                        className={`border-t border-slate-100 ${changed ? "bg-amber-50" : ""}`}
                      >
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {product.name}
                          {changed && (
                            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                              changed
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{product.unit.name} ({product.unit.code})</td>
                        <td className="px-4 py-3 text-end">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={prices[product.id] ?? product.currentPrice}
                            onChange={(e) => {
                              setMessage(null);
                              setPrices((prev) => ({ ...prev, [product.id]: e.target.value }));
                            }}
                            className={`w-32 rounded-lg border px-3 py-2 text-end outline-none focus:border-emerald-500 ${
                              changed ? "border-amber-400" : "border-slate-200"
                            }`}
                          />
                        </td>
                      </tr>
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