"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CurrencyDenomination } from "@repo/types";
import { AuthGuard } from "../../components/common/AuthGuard";
import { Header } from "../../components/common/Header";
import { DenominationGrid } from "../../components/till/DenominationGrid";
import { useAuth } from "../../providers/AuthProvider";
import { useI18n } from "../../providers/I18nProvider";
import { useTill } from "../../providers/TillProvider";
import { fetchCurrentTillSession, fetchDenominations, openTill } from "../../services/till";

export default function OpenTillPage() {
  const { token, tenant } = useAuth();
  const { t } = useI18n();
  const { refresh: refreshTill } = useTill();
  const router = useRouter();

  const symbol = tenant?.currencySymbol ?? "Rs";

  const [denominations, setDenominations] = useState<CurrencyDenomination[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
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

    fetchDenominations(token)
      .then(setDenominations)
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const openingCash = denominations.reduce((sum, d) => {
    const qty = quantities[d.id] ?? 0;
    return sum + qty * parseFloat(d.value);
  }, 0);

  const handleSubmit = async () => {
    if (!token) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await openTill(token, {
        openingCash,
        denominationCounts: Object.entries(quantities)
          .filter(([, qty]) => qty > 0)
          .map(([denominationId, quantity]) => ({ denominationId, quantity })),
      });
      await refreshTill();
      router.replace("/pos");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthGuard>
      <div className="flex min-h-dvh flex-col">
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
