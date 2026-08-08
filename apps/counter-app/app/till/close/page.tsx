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
import { useTill } from "../../providers/TillProvider";
import {
  closeTill,
  fetchCurrentTillSession,
  fetchDenominations,
} from "../../services/till";

export default function CloseTillPage() {
  const { token, tenant } = useAuth();
  const { t } = useI18n();
  const { refresh: refreshTill } = useTill();
  const router = useRouter();

  const symbol = tenant?.currencySymbol ?? "Rs";

  const [session, setSession] = useState<TillSession | null>(null);
  const [denominations, setDenominations] = useState<CurrencyDenomination[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closedSession, setClosedSession] = useState<TillSession | null>(null);

  useEffect(() => {
    if (!token) return;
    setIsLoading(true);
    Promise.all([fetchCurrentTillSession(token), fetchDenominations(token)])
      .then(([currentSession, denoms]) => {
        setSession(currentSession);
        setDenominations(denoms);
      })
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const actualClosingCash = denominations.reduce((sum, d) => {
    const qty = quantities[d.id] ?? 0;
    return sum + qty * parseFloat(d.value);
  }, 0);

  const handleSubmit = async () => {
    if (!token) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const updated = await closeTill(token, {
        actualClosingCash,
        denominationCounts: Object.entries(quantities)
          .filter(([, qty]) => qty > 0)
          .map(([denominationId, quantity]) => ({ denominationId, quantity })),
      });
      setClosedSession(updated);
      await refreshTill();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const variance = closedSession ? parseFloat(closedSession.variance ?? "0") : 0;
  const roundingSummary = closedSession?.roundingSummary;

  return (
    <AuthGuard>
      <div className="flex min-h-dvh flex-col">
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

              <div className="rounded-lg bg-slate-50 p-3">
                <p className="mb-2 text-sm font-semibold text-slate-700">
                  {t.till.roundingSummaryTitle}
                </p>
                {roundingSummary && roundingSummary.transactionCount > 0 ? (
                  <dl className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-slate-600">{t.till.extraReceived}</dt>
                      <dd className="font-medium text-emerald-700">
                        +{formatCurrency(roundingSummary.extraReceived.toFixed(2), symbol)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-600">{t.till.extraGiven}</dt>
                      <dd className="font-medium text-red-600">
                        -{formatCurrency(roundingSummary.extraGiven.toFixed(2), symbol)}
                      </dd>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 pt-1.5">
                      <dt className="font-semibold text-slate-700">{t.till.roundingNet}</dt>
                      <dd
                        className={`font-bold ${
                          roundingSummary.net === 0
                            ? "text-slate-900"
                            : roundingSummary.net > 0
                              ? "text-emerald-700"
                              : "text-red-600"
                        }`}
                      >
                        {roundingSummary.net >= 0 ? "+" : "-"}
                        {formatCurrency(Math.abs(roundingSummary.net).toFixed(2), symbol)}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="text-sm text-slate-500">{t.till.noRoundingActivity}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => router.push("/pos")}
                className="w-full rounded-xl bg-[var(--accent)] px-6 py-3 font-semibold text-[var(--accent-foreground)] hover:bg-[var(--accent-hover)]"
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

              <p className="text-sm text-slate-600">{t.till.countHint}</p>
              <DenominationGrid
                denominations={denominations}
                quantities={quantities}
                onChange={(id, qty) => setQuantities((prev) => ({ ...prev, [id]: qty }))}
                currencySymbol={symbol}
              />

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || actualClosingCash < 0}
                className="w-full rounded-xl bg-[var(--accent)] px-6 py-3 font-semibold text-[var(--accent-foreground)] hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
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