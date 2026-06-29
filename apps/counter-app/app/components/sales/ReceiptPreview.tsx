"use client";

import { useState } from "react";
import type { BillType, Transaction } from "@repo/types";
import { useAuth } from "../../providers/AuthProvider";
import { useI18n } from "../../providers/I18nProvider";
import { formatCurrency } from "../../services/sales";

interface ReceiptPreviewProps {
  transaction: Transaction;
  onPrint: () => void;
  onNewSale: () => void;
}

export function ReceiptPreview({ transaction, onPrint, onNewSale }: ReceiptPreviewProps) {
  const { tenant, user, branch, canIssuePricedBill } = useAuth();
  const { t } = useI18n();
  const symbol = tenant?.currencySymbol ?? "Rs";

  // Per requirements Section 13.5.2:
  // Priced Bill  — Owner + Authorized Cashier (canIssuePricedBill flag)
  // Delivery Note — ANY cashier, no restriction
  // FIXED: old code used isOwner which was wrong — authorized cashiers were blocked.
  const [billType, setBillType] = useState<BillType>(
    canIssuePricedBill ? "priced" : "unpriced"
  );
  const [notes, setNotes] = useState(transaction.notes ?? "");
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const isPriced = billType === "priced";

  // PDF export — Section 13.5.5. Uses browser print-to-PDF.
  // Replace with a /bills/pdf API call when server-side PDF is implemented.
  async function handleExportPdf() {
    setIsExportingPdf(true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    window.print();
    setIsExportingPdf(false);
  }

  return (
    <div className="mx-auto max-w-lg">

      {/* Bill type selector — hidden on print */}
      <div className="mb-4 print:hidden">
        <p className="mb-2 text-sm font-medium text-slate-700">{t.receipt.billType}</p>
        <div className="grid grid-cols-2 gap-3">

          {/* Priced Bill — Owner + Authorized Cashier only (Section 13.5.2) */}
          <button
            type="button"
            disabled={!canIssuePricedBill}
            onClick={() => setBillType("priced")}
            className={`rounded-xl border-2 p-3 text-left transition-all ${
              isPriced
                ? "border-emerald-500 bg-emerald-50"
                : canIssuePricedBill
                  ? "border-slate-200 hover:border-slate-300"
                  : "cursor-not-allowed border-slate-100 opacity-40"
            }`}
          >
            <p className="text-sm font-semibold text-slate-900">{t.receipt.pricedBill}</p>
            <p className="mt-0.5 text-xs text-slate-500">{t.receipt.pricedBillDesc}</p>
            {!canIssuePricedBill && (
              <p className="mt-1 text-xs font-medium text-amber-600">
                {t.receipt.pricedBillRestricted}
              </p>
            )}
          </button>

          {/* Delivery Note — any cashier (Section 13.5.2) */}
          <button
            type="button"
            onClick={() => setBillType("unpriced")}
            className={`rounded-xl border-2 p-3 text-left transition-all ${
              !isPriced
                ? "border-emerald-500 bg-emerald-50"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <p className="text-sm font-semibold text-slate-900">{t.receipt.deliveryNote}</p>
            <p className="mt-0.5 text-xs text-slate-500">{t.receipt.deliveryNoteDesc}</p>
          </button>
        </div>

        {/* Optional free-text notes — both bill types (Section 13.5.7) */}
        <div className="mt-3">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {t.receipt.notes}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t.receipt.notesPlaceholder}
            rows={2}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
        </div>
      </div>

      {/* ── BILL DOCUMENT ── */}
      <div
        id="receipt-print"
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm print:border-0 print:shadow-none"
      >
        {/* Tenant branding — Section 13.5.3 (branch overrides tenant defaults) */}
        <div className="border-b border-dashed border-slate-300 pb-4 text-center">
          <h2 className="text-xl font-bold text-slate-900">{tenant?.name}</h2>
          {tenant?.address && (
            <p className="mt-1 text-xs text-slate-500">{tenant.address}</p>
          )}
          {tenant?.phone && (
            <p className="text-xs text-slate-500">{tenant.phone}</p>
          )}
          {branch?.name && (
            <p className="mt-1 text-xs font-medium text-slate-600">{branch.name}</p>
          )}
          <p className="mt-2 text-sm font-semibold text-slate-800">
            {isPriced ? t.receipt.pricedBill : t.receipt.deliveryNote}
          </p>
        </div>

        {/* Transaction meta */}
        <div className="space-y-1 border-b border-dashed border-slate-300 py-4 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">{t.receipt.receiptNo}</span>
            <span className="font-mono font-medium">{transaction.receiptNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">{t.receipt.date}</span>
            <span>{new Date(transaction.createdAt).toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">{t.receipt.cashier}</span>
            <span>{transaction.createdByName ?? user?.displayName}</span>
          </div>
          {/* Payment only on priced bill */}
          {isPriced && (
            <div className="flex justify-between">
              <span className="text-slate-500">{t.receipt.payment}</span>
              <span className="capitalize">{transaction.paymentMethod}</span>
            </div>
          )}
        </div>

        {/* Line items */}
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2 text-start font-medium">{t.prices.product}</th>
              <th className="py-2 text-end font-medium">{t.pos.quantity}</th>
              {/* Rates only on Priced Bill (Section 13.5.2) */}
              {isPriced && (
                <>
                  <th className="py-2 text-end font-medium">{t.pos.rate}</th>
                  <th className="py-2 text-end font-medium">{t.pos.lineTotal}</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {transaction.lineItems.map((line) => (
              <tr key={line.id ?? line.productId} className="border-b border-slate-100">
                <td className="py-2">{line.productName}</td>
                <td className="py-2 text-end">
                  {line.quantity} {line.unit}
                </td>
                {isPriced && (
                  <>
                    <td className="py-2 text-end">{formatCurrency(line.rate, symbol)}</td>
                    <td className="py-2 text-end font-medium">
                      {formatCurrency(line.lineTotal, symbol)}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Grand total — Priced Bill only (Section 13.5.2) */}
        {isPriced && (
          <div className="mt-4 flex justify-between border-t border-slate-200 pt-4 text-lg font-bold">
            <span>{t.pos.total}</span>
            <span className="text-emerald-700">
              {formatCurrency(transaction.total, symbol)}
            </span>
          </div>
        )}

        {/* Notes — both bill types if filled (Section 13.5.7) */}
        {notes.trim() && (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="text-xs font-medium text-slate-500">{t.receipt.notes}:</p>
            <p className="mt-1 text-sm text-slate-700">{notes}</p>
          </div>
        )}

        <p className="mt-6 text-center text-sm text-slate-400">{t.receipt.thankYou}</p>
      </div>

      {/* Action buttons — hidden on print (Section 13.5.5) */}
      <div className="mt-4 flex gap-3 print:hidden">
        <button
          type="button"
          onClick={onPrint}
          className="flex-1 rounded-xl border border-slate-200 py-3 font-medium text-slate-700 hover:bg-slate-50"
        >
          {t.receipt.print}
        </button>

        {/* Export as PDF — Section 13.5.5 */}
        <button
          type="button"
          onClick={handleExportPdf}
          disabled={isExportingPdf}
          className="flex-1 rounded-xl border border-slate-200 py-3 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {isExportingPdf ? t.receipt.exportingPdf : t.receipt.exportPdf}
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