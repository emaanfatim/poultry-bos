"use client";

import type { CartLineItem } from "@repo/types";
import { useI18n } from "../../providers/I18nProvider";
import { CartItem } from "./CartItem";
import { CartSummary } from "./CartSummary";

interface CartProps {
  items: CartLineItem[];
  subtotal: string;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
  onCheckout: () => void;
}

export function Cart({
  items,
  subtotal,
  onUpdateQuantity,
  onRemove,
  onCheckout,
}: CartProps) {
  const { t } = useI18n();

  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">{t.pos.cart}</h2>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">{t.pos.emptyCart}</p>
        ) : (
          items.map((item) => (
            <CartItem
              key={item.productId}
              item={item}
              onUpdateQuantity={onUpdateQuantity}
              onRemove={onRemove}
            />
          ))
        )}
      </div>

      <CartSummary
        subtotal={subtotal}
        onCheckout={onCheckout}
        disabled={items.length === 0}
      />
    </div>
  );
}
