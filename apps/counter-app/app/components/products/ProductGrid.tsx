"use client";

import type { Product } from "@repo/types";
import { useI18n } from "../../providers/I18nProvider";
import { ProductCard } from "./ProductCard";

interface ProductGridProps {
  products: Product[];
  onAdd: (product: Product, quantity: number) => void;
}

export function ProductGrid({ products, onAdd }: ProductGridProps) {
  const { t } = useI18n();

  if (products.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
        {t.pos.noProducts}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} onAdd={onAdd} />
      ))}
    </div>
  );
}
