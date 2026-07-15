"use client";

import { useEffect, useState } from "react";
import type { TillHandover, TillSession } from "@repo/types";
import { AuthGuard } from "../../components/common/AuthGuard";
import { Header } from "../../components/common/Header";
import { formatCurrency } from "../../services/sales";
import { useAuth } from "../../providers/AuthProvider";
import { useI18n } from "../../providers/I18nProvider";
import {
  createHandover,
  fetchHandoverCandidates,
  fetchHandoverHistory,
} from "../../services/till";

export default function HandoverPage() {
  const { token, tenant, canReceiveHandover } = useAuth();
  const { t } = useI18n();
  const symbol = tenant?.currencySymbol ?? "Rs";

  const [candidates, setCandidates] = useState<TillSession[]>([]);
  const [history, setHistory] = useState<TillHandover[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [totalReceived, setTotalReceived] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastHandover, setLastHandover] = useState<TillHandover | null>(null);

  const load = () => {
    if (!token) return;
    setIsLoading(true);
    Promise.all([fetchHandoverCandidates(token), fetchHandoverHistory(token)])
      .then(([c, h]) => {
        setCandidates(c);
        setHistory(h);
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!canReceiveHandover) {
    return (
      <AuthGuard>
        <div className="flex min-h-screen flex-col">
          <Header />
          <main className="mx-auto max-w-3xl p-8 text-center">
            <p className="text-slate-600">
              You don&apos;t have permission to receive handovers.
            </p>
          </main>
        </div>
      </AuthGuard>
    );
  }

  const totalExpected = candidates
    .filter((s) => selected.has(s.id))
    .reduce((sum, s) => sum + parseFloat(s.actualClosingCash ?? "0"), 0);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!token || selected.size === 0) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const handover = await createHandover(token, {
        tillSessionIds: Array.from(selected),
        totalReceived: parseFloat(totalReceived || "0"),
      });
      setLastHandover(handover);
      setSelected(new Set());
      setTotalReceived("");
      load();
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

        <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 p-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{t.till.handoverTitle}</h2>
            <p className="text-slate-600">{t.till.handoverSubtitle}</p>
          </div>

          {isLoading ? (
            <p>{t.common.loading}</p>
          ) : (
            <>
              {lastHandover && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  {t.till.confirmHandover} — {t.till.variance}:{" "}
                  {formatCurrency(lastHandover.variance, symbol)}
                </div>
              )}

              <section className="space-y-3">
                <h3 className="font-semibold text-slate-800">{t.till.selectSessions}</h3>
                {candidates.length === 0 ? (
                  <p className="text-sm text-slate-500">{t.till.noCandidateSessions}</p>
                ) : (
                  <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                    {candidates.map((session) => (
                      <label
                        key={session.id}
                        className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50"
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={selected.has(session.id)}
                            onChange={() => toggle(session.id)}
                          />
                          <div>
                            <p className="text-sm font-medium text-slate-900">
                              {session.userName}
                            </p>
                            <p className="text-xs text-slate-500">
                              {t.till.openedAt} {new Date(session.openedAt).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-slate-900">
                          {formatCurrency(session.actualClosingCash ?? "0", symbol)}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </section>

              {selected.size > 0 && (
                <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">{t.till.totalExpected}</span>
                    <span className="font-semibold text-slate-900">
                      {formatCurrency(totalExpected.toFixed(2), symbol)}
                    </span>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      {t.till.totalReceived}
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">{symbol}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={totalReceived}
                        onChange={(e) => setTotalReceived(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-emerald-500"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  {error && <p className="text-sm text-red-600">{error}</p>}

                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isSubmitting || !totalReceived}
                    className="w-full rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSubmitting ? t.till.submitting : t.till.confirmHandover}
                  </button>
                </section>
              )}

              <section className="space-y-3">
                <h3 className="font-semibold text-slate-800">{t.till.handoverHistory}</h3>
                {history.length === 0 ? (
                  <p className="text-sm text-slate-500">{t.till.noHandovers}</p>
                ) : (
                  <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                    {history.map((h) => {
                      const v = parseFloat(h.variance);
                      return (
                        <div key={h.id} className="px-4 py-3">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-900">
                              {h.receivedByName} · {new Date(h.createdAt).toLocaleString()}
                            </p>
                            <span
                              className={`text-sm font-semibold ${
                                v === 0
                                  ? "text-slate-700"
                                  : v > 0
                                    ? "text-emerald-700"
                                    : "text-red-600"
                              }`}
                            >
                              {formatCurrency(h.totalReceived, symbol)}
                              {v !== 0 &&
                                ` (${v > 0 ? t.till.over : t.till.short} ${formatCurrency(
                                  Math.abs(v).toFixed(2),
                                  symbol,
                                )})`}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {h.sessions.map((s) => s.userName).join(", ")}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
