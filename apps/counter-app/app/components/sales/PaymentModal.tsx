"use client";

import { useAuth } from "../../providers/AuthProvider";
import { useI18n } from "../../providers/I18nProvider";
import { formatCurrency } from "../../services/sales";

interface PaymentModalProps {
  total: string;
  isOpen: boolean;
  isProcessing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PaymentModal({
  total,
  isOpen,
  isProcessing,
  onConfirm,
  onCancel,
}: PaymentModalProps) {
  const { tenant } = useAuth();
  const { t } = useI18n();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-xl font-bold text-slate-900">{t.payment.title}</h2>
        <p className="mt-2 text-sm text-slate-600">{t.payment.cashOnly}</p>
        <p className="mt-4 text-3xl font-bold text-emerald-700">
          {formatCurrency(total, tenant?.currencySymbol ?? "Rs")}
        </p>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isProcessing}
            className="flex-1 rounded-xl border border-slate-200 py-3 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {t.payment.cancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isProcessing}
            className="flex-1 rounded-xl bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {isProcessing ? t.payment.processing : t.payment.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
