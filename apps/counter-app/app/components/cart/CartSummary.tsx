"use client";

import { useAuth } from "../../providers/AuthProvider";
import { useI18n } from "../../providers/I18nProvider";
import { formatCurrency } from "../../services/sales";

interface CartSummaryProps {
  subtotal: string;
  onCheckout: () => void;
  disabled: boolean;
}

export function CartSummary({ subtotal, onCheckout, disabled }: CartSummaryProps) {
  const { tenant } = useAuth();
  const { t } = useI18n();
  const symbol = tenant?.currencySymbol ?? "Rs";

  return (
    <div className="border-t border-slate-200 pt-4">
      <div className="mb-4 flex items-center justify-between text-base">
        <span className="text-slate-600">{t.pos.total}</span>
        <span className="text-xl font-bold text-slate-900">
          {formatCurrency(subtotal, symbol)}
        </span>
      </div>
      <button
        type="button"
        onClick={onCheckout}
        disabled={disabled}
        className="w-full rounded-xl bg-emerald-600 py-3.5 text-base font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {t.pos.checkout}
      </button>
    </div>
  );
}
