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
  onSaveDraft?: () => void;
}

export function Cart({
  items,
  subtotal,
  onUpdateQuantity,
  onRemove,
  onCheckout,
  onSaveDraft,
}: CartProps) {
  const { t } = useI18n();

  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">{t.pos.cart}</h2>
        {onSaveDraft && items.length > 0 && (
          <button
            type="button"
            onClick={onSaveDraft}
            className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors"
          >
            📋 Save as Draft
          </button>
        )}
      </div>

      {/* Items — scrollable with visible scrollbar */}
      <div
        className="min-h-0 flex-1 overflow-y-auto pr-1"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#cbd5e1 transparent" }}
      >
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