"use client";

import { useEffect, useMemo, useState } from "react";
import type { Product, Unit } from "@repo/types";
import { useAuth } from "../../providers/AuthProvider";
import { AuthGuard } from "../../components/AuthGuard";
import { Header } from "../../components/Header";
import { fetchProducts, createProduct, updateProduct, setProductPrice, setProductUnits } from "../../services/products";
import { fetchProductCategories } from "../../services/productCategories";
import { fetchUnits } from "../../services/units";
import { ApiError } from "../../services/api";
import { fileToProductImage, ImageProcessingError } from "../../lib/image";
import { sameFamily } from "../../lib/units";
import type { ProductCategoryLite } from "../../types/charges";

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ProductsPage() {
  return (
    <AuthGuard>
      <Header />
      <ProductsPageContent />
    </AuthGuard>
  );
}

interface NewProductForm {
  categoryId: string;
  subCategoryId: string;
  name: string;
  token: string;
  unitId: string;
  currentPrice: string;
  isServiceItem: boolean;
  sellableUnitIds: string[];
  imageKey: string | null;
}

function emptyForm(): NewProductForm {
  return {
    categoryId: "",
    subCategoryId: "",
    name: "",
    token: "",
    unitId: "",
    currentPrice: "",
    isServiceItem: false,
    sellableUnitIds: [],
    imageKey: null,
  };
}

function ProductsPageContent() {
  const { token, user } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategoryLite[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [form, setForm] = useState<NewProductForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Inline "editing price" state, keyed by product id
  const [priceEdits, setPriceEdits] = useState<Record<string, string>>({});
  const [priceSavingId, setPriceSavingId] = useState<string | null>(null);

  // Image upload for the "new product" form
  const [formImageUploading, setFormImageUploading] = useState(false);

  // Per-product photo replace, keyed by product id
  const [photoUploadingId, setPhotoUploadingId] = useState<string | null>(null);

  // Inline "editing sellable units" state, keyed by product id
  const [unitsEdits, setUnitsEdits] = useState<Record<string, string[]>>({});
  const [unitsSavingId, setUnitsSavingId] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const [productsData, categoriesData, unitsData] = await Promise.all([
        fetchProducts(token),
        fetchProductCategories(token),
        fetchUnits(token),
      ]);
      setProducts(productsData);
      setCategories(categoriesData);
      setUnits(unitsData);
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === form.categoryId),
    [categories, form.categoryId],
  );

  const selectedFormUnit = useMemo(
    () => units.find((u) => u.id === form.unitId) ?? null,
    [units, form.unitId],
  );

  // Only units that actually convert with the chosen priced unit make sense
  // as extra sellable units (e.g. kg's family also includes maund, gram…).
  const compatibleFormUnits = useMemo(() => {
    if (!selectedFormUnit) return [];
    return units.filter((u) => u.id !== selectedFormUnit.id && sameFamily(u, selectedFormUnit));
  }, [units, selectedFormUnit]);

  const productsBySubCategory = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of products) {
      const key = `${p.categoryName} / ${p.subCategoryName}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [products]);

  // Block non-owners (hooks above always run, so this is safe after them)
  if (user?.role !== "owner") {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-slate-500">Access denied — owners only.</p>
      </div>
    );
  }

  // ─── Create product ──────────────────────────────────────────────────────

  function updateForm(patch: Partial<NewProductForm>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  async function submitNewProduct() {
    if (!token) return;
    if (
      !form.subCategoryId ||
      !form.name.trim() ||
      !form.token.trim() ||
      !form.unitId ||
      !form.currentPrice.trim()
    ) {
      setError("Please fill in category, sub-category, name, token, unit and price.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await createProduct(token, {
        subCategoryId: form.subCategoryId,
        name: form.name.trim(),
        token: form.token.trim(),
        unitId: form.unitId,
        currentPrice: form.currentPrice.trim(),
        isServiceItem: form.isServiceItem,
        sellableUnitIds: form.sellableUnitIds,
        imageKey: form.imageKey,
      });
      setForm(emptyForm());
      setShowForm(false);
      await load();
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : "Failed to create product");
    } finally {
      setSaving(false);
    }
  }

  function toggleFormSellableUnit(unitId: string) {
    setForm((prev) => ({
      ...prev,
      sellableUnitIds: prev.sellableUnitIds.includes(unitId)
        ? prev.sellableUnitIds.filter((id) => id !== unitId)
        : [...prev.sellableUnitIds, unitId],
    }));
  }

  async function handleFormImagePick(file: File | undefined) {
    if (!file) return;
    setFormImageUploading(true);
    setError("");
    try {
      const dataUrl = await fileToProductImage(file);
      updateForm({ imageKey: dataUrl });
    } catch (e: unknown) {
      setError(e instanceof ImageProcessingError ? e.message : "Failed to process image");
    } finally {
      setFormImageUploading(false);
    }
  }

  // ─── Edit price ──────────────────────────────────────────────────────────

  function startEditPrice(product: Product) {
    setPriceEdits((prev) => ({ ...prev, [product.id]: product.currentPrice }));
  }

  function cancelEditPrice(productId: string) {
    setPriceEdits((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  }

  async function saveEditPrice(productId: string) {
    if (!token) return;
    const value = priceEdits[productId];
    if (!value || !/^\d+(\.\d{1,2})?$/.test(value)) {
      setError("Enter a valid price (e.g. 350 or 350.50).");
      return;
    }
    setPriceSavingId(productId);
    setError("");
    try {
      await setProductPrice(token, productId, value);
      cancelEditPrice(productId);
      await load();
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : "Failed to update price");
    } finally {
      setPriceSavingId(null);
    }
  }

  // ─── Toggle active / inactive ────────────────────────────────────────────

  async function toggleStatus(product: Product) {
    if (!token) return;
    setError("");
    try {
      await updateProduct(token, product.id, {
        status: product.status === "active" ? "inactive" : "active",
      });
      await load();
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : "Failed to update product");
    }
  }

  // ─── Edit photo ──────────────────────────────────────────────────────────

  async function handleProductImagePick(product: Product, file: File | undefined) {
    if (!token || !file) return;
    setPhotoUploadingId(product.id);
    setError("");
    try {
      const dataUrl = await fileToProductImage(file);
      await updateProduct(token, product.id, { imageKey: dataUrl });
      await load();
    } catch (e: unknown) {
      setError(
        e instanceof ImageProcessingError
          ? e.message
          : e instanceof ApiError
            ? e.message
            : "Failed to update photo",
      );
    } finally {
      setPhotoUploadingId(null);
    }
  }

  // ─── Edit sellable units ─────────────────────────────────────────────────

  function startEditUnits(product: Product) {
    setUnitsEdits((prev) => ({
      ...prev,
      [product.id]: (product.units ?? [product.unit]).map((u) => u.id),
    }));
  }

  function cancelEditUnits(productId: string) {
    setUnitsEdits((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  }

  function toggleEditUnit(productId: string, unitId: string) {
    setUnitsEdits((prev) => {
      const current = prev[productId] ?? [];
      return {
        ...prev,
        [productId]: current.includes(unitId)
          ? current.filter((id) => id !== unitId)
          : [...current, unitId],
      };
    });
  }

  async function saveEditUnits(product: Product) {
    if (!token) return;
    const selected = unitsEdits[product.id] ?? [];
    // The priced unit must always be included — the API requires it.
    const unitIds = Array.from(new Set([product.unit.id, ...selected]));
    setUnitsSavingId(product.id);
    setError("");
    try {
      await setProductUnits(token, product.id, unitIds);
      cancelEditUnits(product.id);
      await load();
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : "Failed to update sellable units");
    } finally {
      setUnitsSavingId(null);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-bold text-slate-900">Products</h1>
          <p className="text-sm text-slate-500">
            Add products, set their unit and price, and manage what&apos;s active.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          {showForm ? "Cancel" : "+ Add Product"}
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── New Product Form ── */}
      {showForm && (
        <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-slate-800">New Product</h2>

          {categories.length === 0 ? (
            <p className="text-sm text-slate-500">
              Create a category and sub-category first on the{" "}
              <a href="/dashboard/categories" className="font-medium text-emerald-600 hover:underline">
                Categories
              </a>{" "}
              page.
            </p>
          ) : units.length === 0 ? (
            <p className="text-sm text-slate-500">No units available yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Category */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Category</label>
                <select
                  value={form.categoryId}
                  onChange={(e) =>
                    updateForm({ categoryId: e.target.value, subCategoryId: "" })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                >
                  <option value="">Select category…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sub-category */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Sub-category</label>
                <select
                  value={form.subCategoryId}
                  onChange={(e) => updateForm({ subCategoryId: e.target.value })}
                  disabled={!selectedCategory}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50"
                >
                  <option value="">
                    {selectedCategory ? "Select sub-category…" : "Choose a category first"}
                  </option>
                  {selectedCategory?.subCategories.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Name */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Name</label>
                <input
                  type="text"
                  placeholder="e.g. Live Broiler"
                  value={form.name}
                  onChange={(e) => updateForm({ name: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              {/* Token */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Token</label>
                <input
                  type="text"
                  placeholder="e.g. P1"
                  value={form.token}
                  onChange={(e) => updateForm({ token: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              {/* Unit */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Priced unit
                </label>
                <select
                  value={form.unitId}
                  onChange={(e) => updateForm({ unitId: e.target.value, sellableUnitIds: [] })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                >
                  <option value="">Select unit…</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Price */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Price per unit
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 350.00"
                  value={form.currentPrice}
                  onChange={(e) => updateForm({ currentPrice: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              {/* Extra sellable units */}
              {compatibleFormUnits.length > 0 && (
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Also sellable in (optional)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {compatibleFormUnits.map((u) => {
                      const checked = form.sellableUnitIds.includes(u.id);
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => toggleFormSellableUnit(u.id)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                            checked
                              ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {u.name} ({u.code})
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Cashiers will be able to sell this product in the priced unit plus whichever of
                    these you pick.
                  </p>
                </div>
              )}

              {/* Photo */}
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Photo (optional)
                </label>
                <div className="flex items-center gap-3">
                  {form.imageKey ? (
                    <img
                      src={form.imageKey}
                      alt=""
                      className="h-16 w-16 rounded-lg border border-slate-200 object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-400">
                      No photo
                    </div>
                  )}
                  <label className="cursor-pointer rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">
                    {formImageUploading ? "Processing…" : form.imageKey ? "Change photo" : "Upload photo"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={formImageUploading}
                      onChange={(e) => handleFormImagePick(e.target.files?.[0])}
                    />
                  </label>
                  {form.imageKey && (
                    <button
                      type="button"
                      onClick={() => updateForm({ imageKey: null })}
                      className="text-xs text-slate-400 hover:text-red-600"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>

              {/* Service item toggle */}
              <div className="flex items-center gap-2 sm:col-span-2">
                <input
                  id="isServiceItem"
                  type="checkbox"
                  checked={form.isServiceItem}
                  onChange={(e) => updateForm({ isServiceItem: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="isServiceItem" className="text-sm text-slate-600">
                  This is a service item (no weight/inventory tracking, e.g. packaging)
                </label>
              </div>

              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={submitNewProduct}
                  disabled={saving}
                  className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 sm:w-auto"
                >
                  {saving ? "Saving…" : "Add Product"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Product List ── */}
      {loading ? (
        <div className="text-center text-slate-400">Loading…</div>
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
          No products yet. Add one above.
        </div>
      ) : (
        <div className="space-y-6">
          {productsBySubCategory.map(([groupLabel, groupProducts]) => (
            <div key={groupLabel} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-3">
                <span className="text-sm font-semibold text-slate-700">{groupLabel}</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {groupProducts.map((p) => {
                  const isEditingPrice = p.id in priceEdits;
                  const isEditingUnits = p.id in unitsEdits;
                  const compatibleUnits = units.filter(
                    (u) => u.id !== p.unit.id && sameFamily(u, p.unit),
                  );
                  return (
                    <li key={p.id} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          {p.imageKey ? (
                            <img
                              src={p.imageKey}
                              alt=""
                              className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-200 text-[10px] text-slate-300">
                              No photo
                            </div>
                          )}
                          <label
                            className={`cursor-pointer text-[10px] font-medium ${
                              photoUploadingId === p.id
                                ? "text-slate-300"
                                : "text-emerald-600 hover:text-emerald-700"
                            }`}
                          >
                            {photoUploadingId === p.id ? "…" : "Edit"}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={photoUploadingId === p.id}
                              onChange={(e) => handleProductImagePick(p, e.target.files?.[0])}
                            />
                          </label>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                {p.token}
                              </span>
                              <span
                                className={`font-medium ${
                                  p.status === "active"
                                    ? "text-slate-900"
                                    : "text-slate-400 line-through"
                                }`}
                              >
                                {p.name}
                              </span>
                              <span className="text-xs text-slate-400">
                                per {p.unit.name} ({p.unit.code})
                              </span>
                            </div>
                            {p.units && p.units.length > 1 && (
                              <p className="mt-0.5 text-xs text-slate-400">
                                Also: {p.units.filter((u) => u.id !== p.unit.id).map((u) => u.code).join(", ")}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          {isEditingPrice ? (
                            <>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={priceEdits[p.id]}
                                onChange={(e) =>
                                  setPriceEdits((prev) => ({ ...prev, [p.id]: e.target.value }))
                                }
                                className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                              />
                              <button
                                type="button"
                                onClick={() => saveEditPrice(p.id)}
                                disabled={priceSavingId === p.id}
                                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                              >
                                {priceSavingId === p.id ? "…" : "Save"}
                              </button>
                              <button
                                type="button"
                                onClick={() => cancelEditPrice(p.id)}
                                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="text-sm font-semibold text-slate-800">
                                Rs. {p.currentPrice}
                              </span>
                              <button
                                type="button"
                                onClick={() => startEditPrice(p)}
                                className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
                              >
                                Edit price
                              </button>
                              {compatibleUnits.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    isEditingUnits ? cancelEditUnits(p.id) : startEditUnits(p)
                                  }
                                  className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
                                >
                                  {isEditingUnits ? "Close" : "Edit units"}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => toggleStatus(p)}
                                className={`text-xs font-medium ${
                                  p.status === "active"
                                    ? "text-red-500 hover:text-red-700"
                                    : "text-emerald-600 hover:text-emerald-700"
                                }`}
                              >
                                {p.status === "active" ? "Deactivate" : "Activate"}
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {isEditingUnits && (
                        <div className="mt-3 rounded-lg bg-slate-50 p-3">
                          <p className="mb-2 text-xs font-medium text-slate-500">
                            Sellable in {p.unit.name} ({p.unit.code}) plus:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {compatibleUnits.map((u) => {
                              const checked = (unitsEdits[p.id] ?? []).includes(u.id);
                              return (
                                <button
                                  key={u.id}
                                  type="button"
                                  onClick={() => toggleEditUnit(p.id, u.id)}
                                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                                    checked
                                      ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                                  }`}
                                >
                                  {u.name} ({u.code})
                                </button>
                              );
                            })}
                          </div>
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => saveEditUnits(p)}
                              disabled={unitsSavingId === p.id}
                              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              {unitsSavingId === p.id ? "Saving…" : "Save units"}
                            </button>
                            <button
                              type="button"
                              onClick={() => cancelEditUnits(p.id)}
                              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-white"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
