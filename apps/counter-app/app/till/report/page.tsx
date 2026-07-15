"use client";

import { useEffect, useState } from "react";
import type { TillReportSummary } from "@repo/types";
import { AuthGuard } from "../../components/common/AuthGuard";
import { Header } from "../../components/common/Header";
import { formatCurrency } from "../../services/sales";
import { useAuth } from "../../providers/AuthProvider";
import { useI18n } from "../../providers/I18nProvider";
import { fetchTillReport } from "../../services/till";

export default function TillReportPage() {
  const { token, tenant, canReceiveHandover } = useAuth();
  const { t } = useI18n();
  const symbol = tenant?.currencySymbol ?? "Rs";

  const [summary, setSummary] = useState<TillReportSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setIsLoading(true);
    fetchTillReport(token)
      .then(setSummary)
      .finally(() => setIsLoading(false));
  }, [token]);

  if (!canReceiveHandover) {
    return (
      <AuthGuard>
        <div className="flex min-h-screen flex-col">
          <Header />
          <main className="mx-auto max-w-3xl p-8 text-center">
            <p className="text-slate-600">
              You don&apos;t have permission to view this report.
            </p>
          </main>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="flex min-h-screen flex-col">
        <Header />

        <main className="mx-auto w-full max-w-5xl flex-1 p-4">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-900">{t.till.reportTitle}</h2>
            <p className="text-slate-600">{t.till.reportSubtitle}</p>
          </div>

          {isLoading || !summary ? (
            <p>{t.common.loading}</p>
          ) : (
            <>
              <div className="mb-4 grid grid-cols-3 gap-4">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs text-slate-500">{t.till.open}</p>
                  <p className="text-xl font-bold text-slate-900">
                    {summary.openSessionsCount}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs text-slate-500">{t.till.closed}</p>
                  <p className="text-xl font-bold text-slate-900">
                    {summary.closedSessionsCount}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs text-slate-500">{t.till.variance}</p>
                  <p
                    className={`text-xl font-bold ${
                      parseFloat(summary.totalVariance) === 0
                        ? "text-slate-900"
                        : parseFloat(summary.totalVariance) > 0
                          ? "text-emerald-700"
                          : "text-red-600"
                    }`}
                  >
                    {formatCurrency(summary.totalVariance, symbol)}
                  </p>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-start font-medium">{t.till.cashier}</th>
                      <th className="px-4 py-3 text-start font-medium">{t.till.status}</th>
                      <th className="px-4 py-3 text-end font-medium">{t.till.openingCash}</th>
                      <th className="px-4 py-3 text-end font-medium">
                        {t.till.expectedClosing}
                      </th>
                      <th className="px-4 py-3 text-end font-medium">{t.till.actualClosing}</th>
                      <th className="px-4 py-3 text-end font-medium">{t.till.variance}</th>
                      <th className="px-4 py-3 text-start font-medium">
                        {t.till.handedOver}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.rows.map((row) => {
                      const v = row.variance ? parseFloat(row.variance) : null;
                      return (
                        <tr key={row.sessionId} className="border-t border-slate-100">
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {row.userName}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded px-2 py-0.5 text-xs font-medium ${
                                row.status === "open"
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {row.status === "open" ? t.till.open : t.till.closed}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-end">
                            {formatCurrency(row.openingCash, symbol)}
                          </td>
                          <td className="px-4 py-3 text-end">
                            {row.expectedClosingCash
                              ? formatCurrency(row.expectedClosingCash, symbol)
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-end">
                            {row.actualClosingCash
                              ? formatCurrency(row.actualClosingCash, symbol)
                              : "—"}
                          </td>
                          <td
                            className={`px-4 py-3 text-end font-semibold ${
                              v === null
                                ? "text-slate-400"
                                : v === 0
                                  ? "text-slate-900"
                                  : v > 0
                                    ? "text-emerald-700"
                                    : "text-red-600"
                            }`}
                          >
                            {v === null ? "—" : formatCurrency(v.toFixed(2), symbol)}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {row.handedOver ? t.till.handedOver : t.till.notHandedOver}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
