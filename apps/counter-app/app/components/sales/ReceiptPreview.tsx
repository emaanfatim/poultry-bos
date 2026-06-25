"use client";

import type { Transaction } from "@repo/types";
import { useAuth } from "../../providers/AuthProvider";
import { useI18n } from "../../providers/I18nProvider";
import { formatCurrency } from "../../services/sales";

interface ReceiptPreviewProps {
  transaction: Transaction;
  onPrint: () => void;
  onNewSale: () => void;
}

export function ReceiptPreview({ transaction, onPrint, onNewSale }: ReceiptPreviewProps) {
  const { tenant, user } = useAuth();
  const { t } = useI18n();
  const symbol = tenant?.currencySymbol ?? "Rs";

  return (
    <div className="mx-auto max-w-md">
      <div
        id="receipt-print"
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm print:border-0 print:shadow-none"
      >
        <div className="border-b border-dashed border-slate-300 pb-4 text-center">
          <h2 className="text-xl font-bold text-slate-900">{tenant?.name}</h2>
          <p className="mt-1 text-sm text-slate-600">{t.receipt.title}</p>
        </div>

        <div className="space-y-1 border-b border-dashed border-slate-300 py-4 text-sm">
          <p>
            <span className="text-slate-500">{t.receipt.receiptNo}: </span>
            {transaction.receiptNumber}
          </p>
          <p>
            <span className="text-slate-500">{t.receipt.date}: </span>
            {new Date(transaction.createdAt).toLocaleString()}
          </p>
          <p>
            <span className="text-slate-500">{t.receipt.cashier}: </span>
            {transaction.createdByName ?? user?.displayName}
          </p>
        </div>

        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2 text-start font-medium">{t.prices.product}</th>
              <th className="py-2 text-end font-medium">{t.pos.quantity}</th>
              <th className="py-2 text-end font-medium">{t.pos.rate}</th>
              <th className="py-2 text-end font-medium">{t.pos.lineTotal}</th>
            </tr>
          </thead>
          <tbody>
            {transaction.lineItems.map((line) => (
              <tr key={line.id ?? line.productId} className="border-b border-slate-100">
                <td className="py-2">{line.productName}</td>
                <td className="py-2 text-end">
                  {line.quantity} {line.unit}
                </td>
                <td className="py-2 text-end">{formatCurrency(line.rate, symbol)}</td>
                <td className="py-2 text-end font-medium">
                  {formatCurrency(line.lineTotal, symbol)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-between border-t border-slate-200 pt-4 text-lg font-bold">
          <span>{t.pos.total}</span>
          <span>{formatCurrency(transaction.total, symbol)}</span>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">{t.receipt.thankYou}</p>
      </div>

      <div className="mt-4 flex gap-3 print:hidden">
        <button
          type="button"
          onClick={onPrint}
          className="flex-1 rounded-xl border border-slate-200 py-3 font-medium text-slate-700 hover:bg-slate-50"
        >
          {t.receipt.print}
        </button>
        <button
          type="button"
          onClick={onNewSale}
          className="flex-1 rounded-xl bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-700"
        >
          {t.receipt.newSale}
        </button>
      </div>
    </div>
  );
}
