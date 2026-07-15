"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CurrencyDenomination } from "@repo/types";
import { AuthGuard } from "../../components/common/AuthGuard";
import { Header } from "../../components/common/Header";
import { DenominationGrid } from "../../components/till/DenominationGrid";
import { useAuth } from "../../providers/AuthProvider";
import { useI18n } from "../../providers/I18nProvider";
import { fetchCurrentTillSession, fetchDenominations, openTill } from "../../services/till";

export default function OpenTillPage() {
  const { token, tenant, user } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  const symbol = tenant?.currencySymbol ?? "Rs";
  const requiresCount = Boolean(user?.requiresTillCount);

  const [denominations, setDenominations] = useState<CurrencyDenomination[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [lumpSum, setLumpSum] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    fetchCurrentTillSession(token).then((session) => {
      if (session) {
        router.replace("/pos");
      }
    });

    if (requiresCount) {
      fetchDenominations(token)
        .then(setDenominations)
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const countedTotal = denominations.reduce((sum, d) => {
    const qty = quantities[d.id] ?? 0;
    return sum + qty * parseFloat(d.value);
  }, 0);

  const openingCash = requiresCount ? countedTotal : parseFloat(lumpSum || "0");

  const handleSubmit = async () => {
    if (!token) return;
    if (!requiresCount && (!lumpSum || parseFloat(lumpSum) < 0)) {
      setError(t.common.error);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await openTill(token, {
        openingCash,
        denominationCounts: requiresCount
          ? Object.entries(quantities)
              .filter(([, qty]) => qty > 0)
              .map(([denominationId, quantity]) => ({ denominationId, quantity }))
          : undefined,
      });
      router.replace("/pos");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthGuard>
      <div className="flex min-h-screen flex-col">
        <Header />

        <main className="mx-auto w-full max-w-xl flex-1 p-4">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-900">{t.till.openTitle}</h2>
            <p className="text-slate-600">{t.till.openSubtitle}</p>
          </div>

          {isLoading ? (
            <p>{t.common.loading}</p>
          ) : (
            <div className="space-y-4">
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
                    {t.till.openingCash}
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
                disabled={isSubmitting || openingCash < 0}
                className="w-full rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? t.till.starting : t.till.startShift}
              </button>
            </div>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
