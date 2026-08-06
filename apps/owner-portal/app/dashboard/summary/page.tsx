"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, X } from "lucide-react";
import type { DailySummary, SummaryPeriod, Transaction } from "@repo/types";
import { AuthGuard } from "../../components/AuthGuard";
import { Header } from "../../components/Header";
import { ReceiptPreview } from "../../components/sales/ReceiptPreview";
import { useAuth } from "../../providers/AuthProvider";
import { fetchDailySummary, fetchTransaction, formatCurrency } from "../../services/sales";

// ─── Period selector ───────────────────────────────────────────────────────
const PERIOD_OPTIONS: Array<{ value: SummaryPeriod; label: string }> = [
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

// Short phrase used in "No sales yet ___" / "sales ___" copy so it matches
// whichever period is currently selected instead of always saying "today".
function periodPhrase(period?: SummaryPeriod): string {
  switch (period) {
    case "hourly":
      return "this hour";
    case "weekly":
      return "this week";
    case "monthly":
      return "this month";
    case "yearly":
      return "this year";
    case "daily":
    default:
      return "today";
  }
}

// ─── Small inline icons (avoids pulling in a new icon dependency) ─────────
function ChartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 16v-4M12 16V8M17 16v-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        d="M12 2c1 3-2 4-2 7a4 4 0 0 0 8 0c2 2 2 5 0 8a7 7 0 0 1-13 0c-1-3 0-5 2-7 0 2 1 3 2 3-1-3 1-6 3-11Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Sales Trend card helpers ──────────────────────────────────────────────
function trendTitle(period?: SummaryPeriod): string {
  switch (period) {
    case "hourly":
      return "Sales by 5 Minutes";
    case "weekly":
    case "monthly":
      return "Sales by Day";
    case "yearly":
      return "Sales by Month";
    case "daily":
    default:
      return "Sales by Hour";
  }
}

function trendCaption(period?: SummaryPeriod): string {
  switch (period) {
    case "hourly":
      return "5-minute totals";
    case "weekly":
    case "monthly":
      return "Day totals";
    case "yearly":
      return "Month totals";
    case "daily":
    default:
      return "Hour-of-day totals";
  }
}

function busiestBucketLabel(period?: SummaryPeriod): string {
  switch (period) {
    case "hourly":
      return "Busiest 5 minutes";
    case "weekly":
    case "monthly":
      return "Busiest day";
    case "yearly":
      return "Busiest month";
    case "daily":
    default:
      return "Busiest hour";
  }
}

// Picks a readable subset of bucket indices to label under the chart —
// all of them when there are few buckets (e.g. 7 for weekly, 12 for
// hourly/yearly), otherwise ~8 evenly spaced ticks (e.g. for a 28-31
// bucket monthly view) so labels don't overlap.
function pickTickIndices(count: number): number[] {
  if (count <= 12) return Array.from({ length: count }, (_, i) => i);
  const tickCount = 8;
  const step = (count - 1) / (tickCount - 1);
  const indices = new Set<number>();
  for (let i = 0; i < tickCount; i++) {
    indices.add(Math.round(i * step));
  }
  return Array.from(indices).sort((a, b) => a - b);
}

function SalesTrendCard({ summary, symbol }: { summary: DailySummary; symbol: string }) {
  const phrase = periodPhrase(summary.period);
  const trend = summary.trend ?? [];
  const max = Math.max(0, ...trend.map((point) => parseFloat(point.revenue)));
  const busiestIdx =
    max > 0 ? trend.findIndex((point) => parseFloat(point.revenue) === max) : -1;
  const tickIndices = useMemo(() => pickTickIndices(trend.length), [trend.length]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <ChartIcon />
        {trendTitle(summary.period)}
      </h3>

      <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
        <span>{formatCurrency(max, symbol)}</span>
        <span>Max</span>
      </div>

      <div className="mt-2 flex h-32 items-end gap-1">
        {trend.map((point, idx) => {
          const value = parseFloat(point.revenue);
          const height = max > 0 ? Math.max((value / max) * 100, value > 0 ? 6 : 3) : 3;
          const isBusiest = idx === busiestIdx;
          return (
            <div
              key={idx}
              title={`${point.fullLabel} · ${formatCurrency(value, symbol)}`}
              className={`flex-1 rounded-t ${
                isBusiest ? "bg-emerald-600" : value > 0 ? "bg-emerald-300" : "bg-slate-100"
              }`}
              style={{ height: `${height}%` }}
            />
          );
        })}
      </div>

      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
        {tickIndices.map((idx) => (
          <span key={idx}>{trend[idx]?.label ?? ""}</span>
        ))}
      </div>

      <p className="mt-4 text-xs text-slate-400">
        {busiestIdx >= 0 ? (
          <>
            {busiestBucketLabel(summary.period)}:{" "}
            <span className="font-semibold text-slate-600">
              {trend[busiestIdx]?.fullLabel}
            </span>{" "}
            ({formatCurrency(max, symbol)})
          </>
        ) : (
          `No sales yet ${phrase}`
        )}
      </p>
      <p className="mt-1 text-[11px] text-slate-300">
        {trendCaption(summary.period)} · {phrase}
      </p>
    </div>
  );
}

function TopItemsCard({ summary, symbol }: { summary: DailySummary; symbol: string }) {
  const phrase = periodPhrase(summary.period);
  const topItems = useMemo(
    () =>
      [...summary.productBreakdown]
        .sort((a, b) => parseFloat(b.totalQuantity) - parseFloat(a.totalQuantity))
        .slice(0, 5),
    [summary],
  );
  const maxQty = Math.max(...topItems.map((item) => parseFloat(item.totalQuantity)), 1);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <FlameIcon />
        Top Items
      </h3>

      {topItems.length === 0 ? (
        <p className="mt-6 text-center text-sm text-slate-400">No sales yet {phrase}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {topItems.map((item, index) => {
            const qty = parseFloat(item.totalQuantity);
            const width = Math.max((qty / maxQty) * 100, 4);
            return (
              <div key={item.productId}>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="text-slate-300">{index + 1}</span>
                    <span className="font-medium text-slate-900">{item.productName}</span>
                  </span>
                  <span className="text-xs text-slate-500">
                    {Number.isInteger(qty) ? qty : qty.toFixed(2)} ·{" "}
                    {formatCurrency(item.totalRevenue, symbol)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                  <div
                    className="h-1.5 rounded-full bg-emerald-600"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-[11px] text-slate-300">Best sellers · {phrase}</p>
    </div>
  );
}

export default function OwnerSummaryPage() {
  const { token, tenant } = useAuth();
  const [period, setPeriod] = useState<SummaryPeriod>("daily");
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const symbol = tenant?.currencySymbol ?? "Rs";
  const phrase = periodPhrase(summary?.period ?? period);

  // Receipt-view modal — reuses the same ReceiptPreview shown at checkout so
  // an owner can inspect exactly what was printed for a past sale.
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
      .catch((err) => setReceiptError(err instanceof Error ? err.message : "Something went wrong"))
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
    fetchDailySummary(token, period)
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong"))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { load(); }, [token, period]);

  return (
    <AuthGuard>
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Summary</h2>
            {summary && (
              <p className="text-sm text-slate-500">
                {summary.rangeLabel ??
                  (() => {
                    const parts = summary.date.split("-").map(Number);
                    const [year, month, day] = parts;
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

        {/* Period selector — hourly / daily / weekly / monthly / yearly */}
        <div className="mb-6 inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPeriod(option.value)}
              aria-pressed={period === option.value}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                period === option.value
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-white hover:text-slate-900"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {isLoading && <p className="text-slate-500">Loading...</p>}
        {error && <p className="text-red-600">{error}</p>}

        {summary && (
          <>
            {/* KPI cards */}
            <div className="mb-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-slate-500">Total Revenue</p>
                <p className="mt-2 text-3xl font-bold text-emerald-700">
                  {formatCurrency(summary.totalRevenue, symbol)}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-slate-500">Transactions</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">
                  {summary.transactionCount}
                </p>
                <p className="mt-1 text-xs text-slate-400">sales {phrase}</p>
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
                    <span className="ml-2 text-sm font-normal text-slate-400">transactions</span>
                  </p>
                  <p className="mt-1 text-lg font-semibold text-emerald-700">
                    {formatCurrency(summary.billTypeBreakdown.priced.revenue, symbol)}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <p className="text-sm text-slate-500">Unpriced Invoices</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">
                    {summary.billTypeBreakdown.unpriced.count}
                    <span className="ml-2 text-sm font-normal text-slate-400">transactions</span>
                  </p>
                  <p className="mt-1 text-lg font-semibold text-amber-700">
                    {formatCurrency(summary.billTypeBreakdown.unpriced.revenue, symbol)}
                  </p>
                </div>
              </div>
            )}

            {/* Extra owner-only widgets: Sales by Hour + Top Items */}
            <div className="mb-6 grid gap-4 lg:grid-cols-2">
              <SalesTrendCard summary={summary} symbol={symbol} />
              <TopItemsCard summary={summary} symbol={symbol} />
            </div>

            {/* Product breakdown */}
            <div className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
              <h3 className="border-b border-slate-100 px-4 py-3 font-semibold text-slate-900">
                Product Breakdown
              </h3>
              {summary.productBreakdown.length === 0 ? (
                <p className="p-6 text-center text-slate-500">No sales yet {phrase}.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-start font-medium">Product</th>
                      <th className="px-4 py-3 text-end font-medium">Quantity</th>
                      <th className="px-4 py-3 text-end font-medium">Total Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...summary.productBreakdown]
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

            {/* Transaction log */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <h3 className="border-b border-slate-100 px-4 py-3 font-semibold text-slate-900">
                Transactions
              </h3>
              {!summary.transactions || summary.transactions.length === 0 ? (
                <p className="p-6 text-center text-slate-500">No sales yet {phrase}.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-start font-medium">Receipt #</th>
                      <th className="px-4 py-3 text-start font-medium">Bill Type</th>
                      <th className="px-4 py-3 text-start font-medium">Customer</th>
                      <th className="px-4 py-3 text-start font-medium">Modifiers</th>
                      <th className="px-4 py-3 text-end font-medium">Discount</th>
                      <th className="px-4 py-3 text-end font-medium">Rounding</th>
                      <th className="px-4 py-3 text-end font-medium">Total</th>
                      <th className="px-4 py-3 text-end font-medium">Date &amp; Time</th>
                      <th className="px-4 py-3 text-center font-medium">View Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.transactions
                      .slice()
                      .sort(
                        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
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
                          <td className="px-4 py-3 text-slate-600">
                            {tx.modifiers && tx.modifiers.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {tx.modifiers.map((mod, idx) => (
                                  <span
                                    key={`${tx.id}-mod-${idx}`}
                                    className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                                  >
                                    {mod.label}
                                    {mod.quantity > 1 ? ` ×${mod.quantity}` : ""}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-end">
                            {tx.discountAmount && parseFloat(tx.discountAmount) > 0 ? (
                              <span className="font-medium text-rose-600">
                                - {formatCurrency(tx.discountAmount, symbol)}
                                {tx.discountType === "percentage" && parseFloat(tx.subtotal) > 0
                                  ? (() => {
                                      const rate =
                                        (parseFloat(tx.discountAmount) / parseFloat(tx.subtotal)) *
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
                              title="View Receipt"
                              aria-label="View Receipt"
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

      {viewingReceiptId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 print:bg-transparent">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl print:max-h-none print:overflow-visible print:shadow-none">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 print:hidden">
              <h3 className="font-semibold text-slate-900">View Receipt</h3>
              <button
                type="button"
                onClick={closeReceipt}
                aria-label="Close"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4">
              {isLoadingReceipt && <p className="text-center text-slate-500">Loading...</p>}
              {receiptError && <p className="text-center text-red-600">{receiptError}</p>}
              {viewedTransaction && (
                <ReceiptPreview
                  transaction={viewedTransaction}
                  onPrint={() => window.print()}
                  onClose={closeReceipt}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}