"use client";

import { useEffect, useMemo, useState } from "react";
import type { Product } from "@repo/types";
import { useAuth } from "../../../providers/AuthProvider";
import { AuthGuard } from "../../../components/AuthGuard";
import { Header } from "../../../components/Header";
import {
  fetchCashiers,
  fetchCashierDiscountSettings,
  updateCashierDiscountSettings,
  type CashierListRow,
} from "../../../services/discounts";
import { fetchProducts } from "../../../services/products";
import { fetchProductCategories } from "../../../services/productCategories";
import type { ProductCategoryLite } from "../../../types/charges";

export default function StaffDiscountsPage() {
  return (
    <AuthGuard>
      <Header />
      <StaffDiscountsContent />
    </AuthGuard>
  );
}

function StaffDiscountsContent() {
  const { token, user } = useAuth();

  const [cashiers, setCashiers] = useState<CashierListRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategoryLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    Promise.all([fetchCashiers(token), fetchProducts(token), fetchProductCategories(token)])
      .then(([cashierRows, productRows, categoryRows]) => {
        setCashiers(cashierRows);
        setProducts(productRows);
        setCategories(categoryRows);
        setSelectedId((current) => current ?? cashierRows[0]?.id ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [token]);

  async function refreshCashiers() {
    if (!token) return;
    try {
      const rows = await fetchCashiers(token);
      setCashiers(rows);
    } catch {
      // non-fatal — the detail panel already has the latest for the open row
    }
  }

  if (user?.role !== "owner") {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-slate-500">Access denied — owners only.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Staff · Checkout Permissions</h1>
      <p className="mb-8 text-sm text-slate-500">
        Choose which cashiers can apply a discount at checkout, how much (% or Rs), whether
        it's limited to specific products or categories, whether it reaches priced bills only
        or priced + unpriced bills alike — and whether this cashier should round bills
        differently from the payment method's usual rule.
      </p>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center text-slate-400">Loading…</div>
      ) : cashiers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
          No cashiers found for this branch yet.
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-[220px_1fr]">
          {/* Cashier list */}
          <div className="space-y-1.5">
            {cashiers.map((cashier) => (
              <button
                key={cashier.id}
                type="button"
                onClick={() => setSelectedId(cashier.id)}
                className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition ${
                  selectedId === cashier.id
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{cashier.displayName}</p>
                  <p className="text-xs text-slate-400">@{cashier.username}</p>
                </div>
                <div className="flex items-center gap-1">
                  {cashier.canApplyDiscount && (
                    <span className="rounded-full bg-[var(--accent-soft-strong)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent-hover)]">
                      ON
                    </span>
                  )}
                  {cashier.canApplyDiscount &&
                    cashier.discountBillTypeScope === "priced_only" && (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                        Priced only
                      </span>
                    )}
                  {cashier.roundingMethodOverride && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                      {cashier.roundingMethodOverride === "round_up"
                        ? "Round Up"
                        : cashier.roundingMethodOverride === "round_down"
                          ? "Round Down"
                          : "Exact"}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Detail panel */}
          {selectedId && (
            <CashierDiscountPanel
              key={selectedId}
              token={token!}
              userId={selectedId}
              cashierName={cashiers.find((c) => c.id === selectedId)?.displayName ?? ""}
              products={products}
              categories={categories}
              onSaved={refreshCashiers}
            />
          )}
        </div>
      )}
    </div>
  );
}

function CashierDiscountPanel({
  token,
  userId,
  cashierName,
  products,
  categories,
  onSaved,
}: {
  token: string;
  userId: string;
  cashierName: string;
  products: Product[];
  categories: ProductCategoryLite[];
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState(false);

  const [canApplyDiscount, setCanApplyDiscount] = useState(false);
  const [percentageEnabled, setPercentageEnabled] = useState(false);
  const [maxDiscountPercentage, setMaxDiscountPercentage] = useState("");
  const [flatEnabled, setFlatEnabled] = useState(false);
  const [maxDiscountFlatAmount, setMaxDiscountFlatAmount] = useState("");
  const [discountRestrictedToProducts, setDiscountRestrictedToProducts] = useState(false);
  const [allowedProductIds, setAllowedProductIds] = useState<Set<string>>(new Set());
  const [productSearch, setProductSearch] = useState("");
  const [discountRestrictedToCategories, setDiscountRestrictedToCategories] = useState(false);
  const [allowedCategoryIds, setAllowedCategoryIds] = useState<Set<string>>(new Set());
  const [discountBillTypeScope, setDiscountBillTypeScope] = useState<
    "priced_only" | "priced_and_unpriced"
  >("priced_and_unpriced");
  const [roundingMethodOverride, setRoundingMethodOverride] = useState<
    "exact" | "round_up" | "round_down" | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchCashierDiscountSettings(token, userId)
      .then((settings) => {
        if (cancelled) return;
        setCanApplyDiscount(settings.canApplyDiscount);
        setPercentageEnabled(settings.maxDiscountPercentage !== null);
        setMaxDiscountPercentage(settings.maxDiscountPercentage ?? "");
        setFlatEnabled(settings.maxDiscountFlatAmount !== null);
        setMaxDiscountFlatAmount(settings.maxDiscountFlatAmount ?? "");
        setDiscountRestrictedToProducts(settings.discountRestrictedToProducts);
        setAllowedProductIds(new Set(settings.allowedProductIds));
        setDiscountRestrictedToCategories(settings.discountRestrictedToCategories);
        setAllowedCategoryIds(new Set(settings.allowedCategoryIds));
        setDiscountBillTypeScope(settings.discountBillTypeScope);
        setRoundingMethodOverride(settings.roundingMethodOverride);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load settings"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, userId]);

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.categoryName.toLowerCase().includes(query) ||
        p.subCategoryName.toLowerCase().includes(query),
    );
  }, [products, productSearch]);

  function toggleProduct(id: string) {
    setAllowedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCategory(id: string) {
    setAllowedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setSavedMessage(false);
    try {
      await updateCashierDiscountSettings(token, userId, {
        canApplyDiscount,
        maxDiscountPercentage: percentageEnabled
          ? Math.min(100, Math.max(0, parseFloat(maxDiscountPercentage) || 0))
          : null,
        maxDiscountFlatAmount: flatEnabled
          ? Math.max(0, parseFloat(maxDiscountFlatAmount) || 0)
          : null,
        discountRestrictedToProducts,
        allowedProductIds: Array.from(allowedProductIds),
        discountRestrictedToCategories,
        allowedCategoryIds: Array.from(allowedCategoryIds),
        discountBillTypeScope,
        roundingMethodOverride,
      });
      setSavedMessage(true);
      onSaved();
      setTimeout(() => setSavedMessage(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-400 shadow-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-slate-800">{cashierName}</h2>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Master toggle */}
      <label className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-slate-800">Allow this cashier to apply discounts</p>
          <p className="text-xs text-slate-400">
            Off by default. Turning this off immediately blocks discounting at checkout.
          </p>
        </div>
        <input
          type="checkbox"
          checked={canApplyDiscount}
          onChange={(e) => setCanApplyDiscount(e.target.checked)}
          className="h-5 w-5 shrink-0 accent-[var(--accent)]"
        />
      </label>

      <div className={`mt-4 space-y-4 ${canApplyDiscount ? "" : "pointer-events-none opacity-40"}`}>
        {/* Caps */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-3">
            <label className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">Percentage discount</span>
              <input
                type="checkbox"
                checked={percentageEnabled}
                onChange={(e) => setPercentageEnabled(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
            </label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                disabled={!percentageEnabled}
                value={maxDiscountPercentage}
                onChange={(e) => setMaxDiscountPercentage(e.target.value)}
                placeholder="e.g. 10"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-[var(--accent-border)] focus:ring-2 focus:ring-[var(--accent-soft-strong)] disabled:bg-slate-50 disabled:text-slate-300"
              />
              <span className="text-sm text-slate-500">%</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">Maximum this cashier can discount, in %.</p>
          </div>

          <div className="rounded-xl border border-slate-200 p-3">
            <label className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">Flat (Rs) discount</span>
              <input
                type="checkbox"
                checked={flatEnabled}
                onChange={(e) => setFlatEnabled(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
            </label>
            <div className="flex items-center gap-1">
              <span className="text-sm text-slate-500">Rs</span>
              <input
                type="number"
                min={0}
                step="0.01"
                disabled={!flatEnabled}
                value={maxDiscountFlatAmount}
                onChange={(e) => setMaxDiscountFlatAmount(e.target.value)}
                placeholder="e.g. 200"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-[var(--accent-border)] focus:ring-2 focus:ring-[var(--accent-soft-strong)] disabled:bg-slate-50 disabled:text-slate-300"
              />
            </div>
            <p className="mt-1 text-xs text-slate-400">Maximum this cashier can discount, in Rs.</p>
          </div>
        </div>

        {!percentageEnabled && !flatEnabled && canApplyDiscount && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Enable at least one discount type above — otherwise this cashier won't be able to
            apply any discount even though the toggle is on.
          </p>
        )}

        {/* Product restriction */}
        <div className="rounded-xl border border-slate-200 p-3">
          <label className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">
                Restrict discount to specific products
              </p>
              <p className="text-xs text-slate-400">
                When on, this cashier's discount only applies to the products checked below.
                The rest of the cart still sells normally, just without any discount.
              </p>
            </div>
            <input
              type="checkbox"
              checked={discountRestrictedToProducts}
              onChange={(e) => setDiscountRestrictedToProducts(e.target.checked)}
              className="h-5 w-5 shrink-0 accent-[var(--accent)]"
            />
          </label>

          {discountRestrictedToProducts && (
            <div className="mt-3">
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search products…"
                className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--accent-border)] focus:ring-2 focus:ring-[var(--accent-soft-strong)]"
              />
              <p className="mb-2 text-xs text-slate-400">
                {allowedProductIds.size} product{allowedProductIds.size === 1 ? "" : "s"} approved
              </p>
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-100 p-2">
                {filteredProducts.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-400">No products found.</p>
                ) : (
                  filteredProducts.map((p) => (
                    <label
                      key={p.id}
                      className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 hover:bg-slate-50"
                    >
                      <span className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={allowedProductIds.has(p.id)}
                          onChange={() => toggleProduct(p.id)}
                          className="h-4 w-4 accent-[var(--accent)]"
                        />
                        {p.name}
                        <span className="text-xs text-slate-400">
                          ({p.categoryName} · {p.subCategoryName})
                        </span>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Category restriction */}
        <div className="rounded-xl border border-slate-200 p-3">
          <label className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">
                Restrict discount to specific categories
              </p>
              <p className="text-xs text-slate-400">
                When on, this cashier's discount applies to every product in the categories
                checked below. Combine freely with the product restriction above — a line
                item is eligible if it matches either one.
              </p>
            </div>
            <input
              type="checkbox"
              checked={discountRestrictedToCategories}
              onChange={(e) => setDiscountRestrictedToCategories(e.target.checked)}
              className="h-5 w-5 shrink-0 accent-[var(--accent)]"
            />
          </label>

          {discountRestrictedToCategories && (
            <div className="mt-3">
              <p className="mb-2 text-xs text-slate-400">
                {allowedCategoryIds.size} categor{allowedCategoryIds.size === 1 ? "y" : "ies"}{" "}
                approved
              </p>
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-100 p-2">
                {categories.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-400">No categories found.</p>
                ) : (
                  categories.map((cat) => (
                    <label
                      key={cat.id}
                      className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 hover:bg-slate-50"
                    >
                      <span className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={allowedCategoryIds.has(cat.id)}
                          onChange={() => toggleCategory(cat.id)}
                          className="h-4 w-4 accent-[var(--accent)]"
                        />
                        {cat.name}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bill-type scope */}
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-sm font-medium text-slate-700">Which bills this applies to</p>
          <p className="mt-0.5 text-xs text-slate-400">
            Priced bills are ordinary cash-and-carry sales. Unpriced bills are credit /
            delivery-note bills settled later — they carry a subtotal the same way, so choose
            whether this cashier's discount should reach those too. Miscellaneous bills are
            never discount-eligible either way.
          </p>
          <select
            value={discountBillTypeScope}
            onChange={(e) =>
              setDiscountBillTypeScope(e.target.value as "priced_only" | "priced_and_unpriced")
            }
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--accent-border)] focus:ring-2 focus:ring-[var(--accent-soft-strong)] sm:w-auto"
          >
            <option value="priced_only">Priced bills only</option>
            <option value="priced_and_unpriced">Both priced and unpriced bills</option>
          </select>
        </div>
      </div>

      {/* Rounding override — independent of the discount settings above */}
      <div className="mt-4 rounded-xl border border-slate-200 p-3">
        <p className="text-sm font-medium text-slate-700">Rounding for this cashier</p>
        <p className="mt-0.5 text-xs text-slate-400">
          By default every cashier uses whatever rounding rule is set on the payment method
          itself (Tax &amp; Charges → Payment Methods). Override it here if this specific
          cashier should always round differently — e.g. always round up, even on a payment
          method the rest of the team rounds down on.
        </p>
        <select
          value={roundingMethodOverride ?? ""}
          onChange={(e) =>
            setRoundingMethodOverride(
              e.target.value === ""
                ? null
                : (e.target.value as "exact" | "round_up" | "round_down"),
            )
          }
          className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--accent-border)] focus:ring-2 focus:ring-[var(--accent-soft-strong)] sm:w-auto"
        >
          <option value="">Use the payment method's default</option>
          <option value="exact">Always exact — never round</option>
          <option value="round_up">Always round up</option>
          <option value="round_down">Always round down</option>
        </select>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        {savedMessage && <span className="text-sm font-medium text-[var(--accent)]">Saved ✓</span>}
      </div>
    </div>
  );
}