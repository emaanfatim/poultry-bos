"use client";

import { useState } from "react";
import type { Product } from "@repo/types";
import { useI18n } from "../../providers/I18nProvider";
import { ProductCard } from "./ProductCard";

interface ProductGridProps {
  products: Product[];
  onAdd: (product: Product, quantity: number) => void;
}

// ─── Group products by category → subcategory ────────────────────────────────

interface SubCategoryGroup {
  name: string;
  products: Product[];
}

interface CategoryGroup {
  name: string;
  subCategories: SubCategoryGroup[];
}

function groupProducts(products: Product[]): CategoryGroup[] {
  const map = new Map<string, Map<string, Product[]>>();

  for (const product of products) {
    if (!map.has(product.categoryName)) {
      map.set(product.categoryName, new Map());
    }
    const subMap = map.get(product.categoryName)!;
    if (!subMap.has(product.subCategoryName)) {
      subMap.set(product.subCategoryName, []);
    }
    subMap.get(product.subCategoryName)!.push(product);
  }

  return Array.from(map.entries()).map(([catName, subMap]) => ({
    name: catName,
    subCategories: Array.from(subMap.entries()).map(([subName, prods]) => ({
      name: subName,
      products: prods,
    })),
  }));
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ProductGrid({ products, onAdd }: ProductGridProps) {
  const { t } = useI18n();
  const grouped = groupProducts(products);

  // Track collapsed state per category and subcategory
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});
  const [collapsedSubs, setCollapsedSubs] = useState<Record<string, boolean>>({});

  if (products.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
        {t.pos.noProducts}
      </div>
    );
  }

  const toggleCat = (name: string) =>
    setCollapsedCats((prev) => ({ ...prev, [name]: !prev[name] }));

  const toggleSub = (key: string) =>
    setCollapsedSubs((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="space-y-4">
      {grouped.map((cat) => {
        const catCollapsed = collapsedCats[cat.name] ?? false;
        const totalProducts = cat.subCategories.reduce(
          (sum, s) => sum + s.products.length,
          0
        );

        return (
          <div
            key={cat.name}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            {/* ── Category Header ── */}
            <button
              type="button"
              onClick={() => toggleCat(cat.name)}
              className="flex w-full items-center justify-between bg-slate-900 px-5 py-3 text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-base font-bold text-white">{cat.name}</span>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs text-white">
                  {totalProducts} products
                </span>
              </div>
              <span className="text-white text-lg">
                {catCollapsed ? "▸" : "▾"}
              </span>
            </button>

            {/* ── Subcategories ── */}
            {!catCollapsed && (
              <div className="divide-y divide-slate-100">
                {cat.subCategories.map((sub) => {
                  const subKey = `${cat.name}__${sub.name}`;
                  const subCollapsed = collapsedSubs[subKey] ?? false;

                  return (
                    <div key={sub.name}>
                      {/* Subcategory Header */}
                      <button
                        type="button"
                        onClick={() => toggleSub(subKey)}
                        className="flex w-full items-center justify-between bg-emerald-50 px-5 py-2.5 text-left"
                      >
                        <div className="flex items-center gap-2">
                          {/* Visual indicator that this is a subcategory */}
                          <span className="text-emerald-400">└</span>
                          <span className="text-sm font-semibold text-emerald-800">
                            {sub.name}
                          </span>
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                            {sub.products.length} item{sub.products.length !== 1 ? "s" : ""}
                          </span>
                          {/* Subcategory badge — clearly shows parent relationship */}
                          <span className="rounded border border-emerald-200 bg-white px-1.5 py-0.5 text-xs text-slate-500">
                            {cat.name} › {sub.name}
                          </span>
                        </div>
                        <span className="text-emerald-600 text-sm">
                          {subCollapsed ? "▸" : "▾"}
                        </span>
                      </button>

                      {/* Products Grid */}
                      {!subCollapsed && (
                        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
                          {sub.products.map((product) => (
                            <ProductCard
                              key={product.id}
                              product={product}
                              onAdd={onAdd}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}