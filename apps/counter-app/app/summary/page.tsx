"use client";

import { useEffect, useState } from "react";
import { Eye, X } from "lucide-react";
import type { DailySummary, Transaction } from "@repo/types";
import { AuthGuard } from "../components/common/AuthGuard";
import { Header } from "../components/common/Header";
import { ReceiptPreview } from "../components/sales/ReceiptPreview";
import { useAuth } from "../providers/AuthProvider";
import { useI18n } from "../providers/I18nProvider";
import { fetchDailySummary, fetchTransaction, formatCurrency } from "../services/sales";

export default function SummaryPage() {
  const { token, tenant } = useAuth();
  const { t } = useI18n();
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const symbol = tenant?.currencySymbol ?? "Rs";

  // Receipt-view modal — reuses the same ReceiptPreview shown at checkout so
  // a cashier/owner can inspect exactly what was printed for a past sale.
  const [viewingReceiptId, setViewingReceiptId] = useState<string | null>(null);
  const [viewedTransaction, setViewedTransaction] = useState<Transaction | null>(null);
  const [isLoadingReceipt, setIsLoadingReceipt] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);

  const openReceipt = (id: string) => {
    if (!token) return;
    setViewingReceiptId(id);
    setViewedTransaction(null);
    setReceiptError(null);
    setIsLoadingReceipt(true);
    fetchTransaction(token, id)
      .then(setViewedTransaction)
      .catch((err) => setReceiptError(err instanceof Error ? err.message : t.common.error))
      .finally(() => setIsLoadingReceipt(false));
  };

  const closeReceipt = () => {
    setViewingReceiptId(null);
    setViewedTransaction(null);
    setReceiptError(null);
  };

  const load = () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    fetchDailySummary(token)
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : t.common.error))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { load(); }, [token]);

  return (
    <AuthGuard>
      <div className="flex min-h-screen flex-col">
        <Header />

        <main className="mx-auto w-full max-w-4xl flex-1 p-4">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">{t.summary.title}</h2>
              {summary && (
                <p className="text-sm text-slate-500">
                  {(() => {
                    const parts = summary.date.split("-").map(Number);
                    const [year, month, day] = parts;
                    // Construct with explicit local-time components so this
                    // always reflects the calendar date the backend meant,
                    // regardless of the browser's own timezone.
                    if (year === undefined || month === undefined || day === undefined) {
                      return summary.date;
                    }
                    return new Date(year, month - 1, day).toLocaleDateString(undefined, {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    });
                  })()}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={load}
              disabled={isLoading}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {isLoading ? "Refreshing..." : "↻ Refresh"}
            </button>
          </div>

          {isLoading && <p className="text-slate-500">{t.common.loading}</p>}
          {error && <p className="text-red-600">{error}</p>}

          {summary && (
            <>
              {/* KPI cards */}
              <div className="mb-6 grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <p className="text-sm text-slate-500">{t.summary.totalRevenue}</p>
                  <p className="mt-2 text-3xl font-bold text-emerald-700">
                    {formatCurrency(summary.totalRevenue, symbol)}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <p className="text-sm text-slate-500">{t.summary.transactionCount}</p>
                  <p className="mt-2 text-3xl font-bold text-slate-900">
                    {summary.transactionCount}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">sales today</p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <p className="text-sm text-slate-500">Avg. Order Value</p>
                  <p className="mt-2 text-3xl font-bold text-slate-900">
                    {formatCurrency(summary.avgOrderValue, symbol)}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">per transaction</p>
                </div>
              </div>

              {/* Bill type breakdown */}
              {summary.billTypeBreakdown && (
                <div className="mb-6 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="text-sm text-slate-500">Priced Bills</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">
                      {summary.billTypeBreakdown.priced.count}
                      <span className="ml-2 text-sm font-normal text-slate-400">
                        transactions
                      </span>
                    </p>
                    <p className="mt-1 text-lg font-semibold text-emerald-700">
                      {formatCurrency(summary.billTypeBreakdown.priced.revenue, symbol)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="text-sm text-slate-500">Unpriced Invoices</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">
                      {summary.billTypeBreakdown.unpriced.count}
                      <span className="ml-2 text-sm font-normal text-slate-400">
                        transactions
                      </span>
                    </p>
                    <p className="mt-1 text-lg font-semibold text-amber-700">
                      {formatCurrency(summary.billTypeBreakdown.unpriced.revenue, symbol)}
                    </p>
                  </div>
                </div>
              )}

              {/* Product breakdown */}
              <div className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
                <h3 className="border-b border-slate-100 px-4 py-3 font-semibold text-slate-900">
                  {t.summary.productBreakdown}
                </h3>
                {summary.productBreakdown.length === 0 ? (
                  <p className="p-6 text-center text-slate-500">{t.summary.noSales}</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-4 py-3 text-start font-medium">{t.prices.product}</th>
                        <th className="px-4 py-3 text-end font-medium">{t.pos.quantity}</th>
                        <th className="px-4 py-3 text-end font-medium">{t.summary.totalRevenue}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.productBreakdown
                        .sort((a, b) => parseFloat(b.totalRevenue) - parseFloat(a.totalRevenue))
                        .map((row) => (
                          <tr key={row.productId} className="border-t border-slate-100">
                            <td className="px-4 py-3 font-medium text-slate-900">
                              {row.productName}
                            </td>
                            <td className="px-4 py-3 text-end text-slate-600">
                              {row.totalQuantity} {row.unit}
                            </td>
                            <td className="px-4 py-3 text-end font-semibold text-emerald-700">
                              {formatCurrency(row.totalRevenue, symbol)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                    {/* Footer totals row */}
                    <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                      <tr>
                        <td className="px-4 py-3 font-semibold text-slate-900">Total</td>
                        <td />
                        <td className="px-4 py-3 text-end font-bold text-slate-900">
                          {formatCurrency(summary.totalRevenue, symbol)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>

              {/* Transaction log with date/timestamp */}
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <h3 className="border-b border-slate-100 px-4 py-3 font-semibold text-slate-900">
                  Transactions
                </h3>
                {!summary.transactions || summary.transactions.length === 0 ? (
                  <p className="p-6 text-center text-slate-500">{t.summary.noSales}</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-4 py-3 text-start font-medium">Receipt #</th>
                        <th className="px-4 py-3 text-start font-medium">Bill Type</th>
                        <th className="px-4 py-3 text-start font-medium">Customer</th>
                        <th className="px-4 py-3 text-end font-medium">{t.receipt.discount}</th>
                        <th className="px-4 py-3 text-end font-medium">{t.receipt.rounding}</th>
                        <th className="px-4 py-3 text-end font-medium">Total</th>
                        <th className="px-4 py-3 text-end font-medium">Date &amp; Time</th>
                        <th className="px-4 py-3 text-center font-medium">{t.receipt.viewReceipt}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.transactions
                        .slice()
                        .sort(
                          (a, b) =>
                            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
                        )
                        .map((tx) => (
                          <tr key={tx.id} className="border-t border-slate-100">
                            <td className="px-4 py-3 font-mono text-slate-900">
                              {tx.receiptNumber}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                  tx.billType === "unpriced"
                                    ? "bg-amber-50 text-amber-700"
                                    : "bg-emerald-50 text-emerald-700"
                                }`}
                              >
                                {tx.billType === "unpriced" ? "Unpriced" : "Priced"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {tx.customerName ? (
                                <>
                                  {tx.customerName}
                                  {tx.customerPhone && (
                                    <span className="ml-1 text-xs text-slate-400">
                                      ({tx.customerPhone})
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-end">
                              {tx.discountAmount && parseFloat(tx.discountAmount) > 0 ? (
                                <span className="font-medium text-rose-600">
                                  - {formatCurrency(tx.discountAmount, symbol)}
                                  {tx.discountType === "percentage" &&
                                  parseFloat(tx.subtotal) > 0
                                    ? (() => {
                                        const rate =
                                          (parseFloat(tx.discountAmount) /
                                            parseFloat(tx.subtotal)) *
                                          100;
                                        const rateLabel = Number.isInteger(rate)
                                          ? rate.toString()
                                          : rate.toFixed(2);
                                        return ` (${rateLabel}%)`;
                                      })()
                                    : ""}
                                </span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-end">
                              {tx.roundingAdjustment && parseFloat(tx.roundingAdjustment) !== 0 ? (
                                <span className="font-medium text-slate-500">
                                  {parseFloat(tx.roundingAdjustment) > 0 ? "+ " : "- "}
                                  {formatCurrency(
                                    Math.abs(parseFloat(tx.roundingAdjustment)).toFixed(2),
                                    symbol,
                                  )}
                                </span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-end font-semibold text-slate-900">
                              {formatCurrency(tx.total, symbol)}
                            </td>
                            <td className="px-4 py-3 text-end text-slate-500">
                              {new Date(tx.createdAt).toLocaleString(undefined, {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => openReceipt(tx.id)}
                                title={t.receipt.viewReceipt}
                                aria-label={t.receipt.viewReceipt}
                                className="inline-flex items-center justify-center rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-emerald-700"
                              >
                                <Eye size={18} />
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {viewingReceiptId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 print:bg-transparent">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl print:max-h-none print:overflow-visible print:shadow-none">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 print:hidden">
              <h3 className="font-semibold text-slate-900">{t.receipt.viewReceipt}</h3>
              <button
                type="button"
                onClick={closeReceipt}
                aria-label={t.common.close}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4">
              {isLoadingReceipt && <p className="text-center text-slate-500">{t.common.loading}</p>}
              {receiptError && <p className="text-center text-red-600">{receiptError}</p>}
              {viewedTransaction && (
                <ReceiptPreview
                  transaction={viewedTransaction}
                  onPrint={() => window.print()}
                  onNewSale={closeReceipt}
                  showNewSale={false}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}