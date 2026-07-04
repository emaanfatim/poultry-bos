"use client";

import { useEffect, useState } from "react";
import type { DailySummary } from "@repo/types";
import { AuthGuard } from "../components/common/AuthGuard";
import { Header } from "../components/common/Header";
import { useAuth } from "../providers/AuthProvider";
import { useI18n } from "../providers/I18nProvider";
import { fetchDailySummary, formatCurrency } from "../services/sales";

export default function SummaryPage() {
  const { token, tenant } = useAuth();
  const { t } = useI18n();
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const symbol = tenant?.currencySymbol ?? "Rs";

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
                  {new Date(summary.date).toLocaleDateString(undefined, {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
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
                    <p className="text-sm text-slate-500">Unpriced (Delivery Notes)</p>
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
                        <th className="px-4 py-3 text-end font-medium">Total</th>
                        <th className="px-4 py-3 text-end font-medium">Date &amp; Time</th>
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
                            <td className="px-4 py-3 text-end font-semibold text-slate-900">
                              {formatCurrency(tx.total, symbol)}
                            </td>
                            <td className="px-4 py-3 text-end text-slate-500">
                              {new Date(tx.createdAt).toLocaleString(undefined, {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })}
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
    </AuthGuard>
  );
}