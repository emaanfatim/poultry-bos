"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CurrencyDenomination, TillSession } from "@repo/types";
import { AuthGuard } from "../../components/common/AuthGuard";
import { Header } from "../../components/common/Header";
import { DenominationGrid } from "../../components/till/DenominationGrid";
import { formatCurrency } from "../../services/sales";
import { useAuth } from "../../providers/AuthProvider";
import { useI18n } from "../../providers/I18nProvider";
import {
  closeTill,
  fetchCurrentTillSession,
  fetchDenominations,
} from "../../services/till";

export default function CloseTillPage() {
  const { token, tenant, user } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  const symbol = tenant?.currencySymbol ?? "Rs";
  const requiresCount = Boolean(user?.requiresTillCount);

  const [session, setSession] = useState<TillSession | null>(null);
  const [denominations, setDenominations] = useState<CurrencyDenomination[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [lumpSum, setLumpSum] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closedSession, setClosedSession] = useState<TillSession | null>(null);

  useEffect(() => {
    if (!token) return;
    setIsLoading(true);
    Promise.all([
      fetchCurrentTillSession(token),
      requiresCount ? fetchDenominations(token) : Promise.resolve([]),
    ])
      .then(([currentSession, denoms]) => {
        setSession(currentSession);
        setDenominations(denoms);
      })
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const countedTotal = denominations.reduce((sum, d) => {
    const qty = quantities[d.id] ?? 0;
    return sum + qty * parseFloat(d.value);
  }, 0);

  const actualClosingCash = requiresCount ? countedTotal : parseFloat(lumpSum || "0");

  const handleSubmit = async () => {
    if (!token) return;
    if (!requiresCount && (!lumpSum || parseFloat(lumpSum) < 0)) {
      setError(t.common.error);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const updated = await closeTill(token, {
        actualClosingCash,
        denominationCounts: requiresCount
          ? Object.entries(quantities)
              .filter(([, qty]) => qty > 0)
              .map(([denominationId, quantity]) => ({ denominationId, quantity }))
          : undefined,
      });
      setClosedSession(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const variance = closedSession ? parseFloat(closedSession.variance ?? "0") : 0;

  return (
    <AuthGuard>
      <div className="flex min-h-screen flex-col">
        <Header />

        <main className="mx-auto w-full max-w-xl flex-1 p-4">
          {isLoading ? (
            <p>{t.common.loading}</p>
          ) : !session ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
              <p className="text-slate-600">{t.till.currentSession}</p>
              <button
                type="button"
                onClick={() => router.push("/till/open")}
                className="mt-4 text-emerald-700 underline"
              >
                {t.till.startShift}
              </button>
            </div>
          ) : closedSession ? (
            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="text-xl font-bold text-slate-900">{t.till.closeTitle}</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-600">{t.till.expectedClosing}</dt>
                  <dd className="font-medium text-slate-900">
                    {formatCurrency(closedSession.expectedClosingCash ?? "0", symbol)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-600">{t.till.actualClosing}</dt>
                  <dd className="font-medium text-slate-900">
                    {formatCurrency(closedSession.actualClosingCash ?? "0", symbol)}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-slate-100 pt-2">
                  <dt className="font-semibold text-slate-700">{t.till.variance}</dt>
                  <dd
                    className={`font-bold ${
                      variance === 0
                        ? "text-slate-900"
                        : variance > 0
                          ? "text-emerald-700"
                          : "text-red-600"
                    }`}
                  >
                    {variance === 0
                      ? t.till.matched
                      : `${variance > 0 ? t.till.over : t.till.short} ${formatCurrency(
                          Math.abs(variance).toFixed(2),
                          symbol,
                        )}`}
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={() => router.push("/pos")}
                className="w-full rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700"
              >
                {t.till.goToSale}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="mb-2">
                <h2 className="text-2xl font-bold text-slate-900">{t.till.closeTitle}</h2>
                <p className="text-slate-600">{t.till.closeSubtitle}</p>
              </div>

              {requiresCount ? (
                <>
                  <p className="text-sm text-slate-600">{t.till.countHint}</p>
                  <DenominationGrid
                    denominations={denominations}
                    quantities={quantities}
                    onChange={(id, qty) =>
                      setQuantities((prev) => ({ ...prev, [id]: qty }))
                    }
                    currencySymbol={symbol}
                  />
                </>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    {t.till.closingCash}
                  </label>
                  <p className="mb-2 text-xs text-slate-500">{t.till.lumpSumHint}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">{symbol}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={lumpSum}
                      onChange={(e) => setLumpSum(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-emerald-500"
                      placeholder="0.00"
                      autoFocus
                    />
                  </div>
                </div>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || actualClosingCash < 0}
                className="w-full rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? t.till.ending : t.till.endShift}
              </button>
            </div>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
