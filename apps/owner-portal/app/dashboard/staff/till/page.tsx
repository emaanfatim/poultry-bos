"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../../providers/AuthProvider";
import { AuthGuard } from "../../../components/AuthGuard";
import { Header } from "../../../components/Header";
import {
  fetchCashierTillSettings,
  updateCashierTillSettings,
  type CashierTillRow,
  type TillGateScope,
} from "../../../services/till-settings";

export default function StaffTillPage() {
  return (
    <AuthGuard>
      <Header />
      <StaffTillContent />
    </AuthGuard>
  );
}

function StaffTillContent() {
  const { token, user } = useAuth();

  const [cashiers, setCashiers] = useState<CashierTillRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetchCashierTillSettings(token)
      .then((rows) => {
        setCashiers(rows);
        setSelectedId((current) => current ?? rows[0]?.id ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [token]);

  async function refreshCashiers() {
    if (!token) return;
    try {
      const rows = await fetchCashierTillSettings(token);
      setCashiers(rows);
    } catch {
      // non-fatal — the detail panel already has the latest for the open row
    }
  }

  if (user?.role !== "owner") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-slate-500">Access denied — owners only.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Staff · Till</h1>
      <p className="mb-8 text-sm text-slate-500">
        Choose which cashiers must have an active till before they can sell, and whether that
        requirement covers every bill or just priced cash bills.
      </p>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center text-slate-400">Loading…</div>
      ) : cashiers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
          No cashiers found for this branch yet.
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-[220px_1fr]">
          {/* Cashier list */}
          <div className="space-y-1.5">
            {cashiers.map((cashier) => (
              <button
                key={cashier.id}
                type="button"
                onClick={() => setSelectedId(cashier.id)}
                className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition ${
                  selectedId === cashier.id
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{cashier.displayName}</p>
                  <p className="text-xs text-slate-400">@{cashier.username}</p>
                </div>
                <div className="flex items-center gap-1">
                  {cashier.requiresTillToSell && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                      ON
                    </span>
                  )}
                  {cashier.requiresTillToSell &&
                    cashier.requiresTillToSellScope === "priced_cash_only" && (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                        Priced cash only
                      </span>
                    )}
                </div>
              </button>
            ))}
          </div>

          {/* Detail panel */}
          {selectedId && (
            <CashierTillPanel
              key={selectedId}
              token={token!}
              cashier={cashiers.find((c) => c.id === selectedId)!}
              onSaved={refreshCashiers}
            />
          )}
        </div>
      )}
    </div>
  );
}

function CashierTillPanel({
  token,
  cashier,
  onSaved,
}: {
  token: string;
  cashier: CashierTillRow;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState(false);

  const [requiresTillToSell, setRequiresTillToSell] = useState(cashier.requiresTillToSell);
  const [requiresTillToSellScope, setRequiresTillToSellScope] = useState<TillGateScope>(
    cashier.requiresTillToSellScope,
  );

  async function handleSave() {
    setSaving(true);
    setError("");
    setSavedMessage(false);
    try {
      await updateCashierTillSettings(token, cashier.id, {
        requiresTillToSell,
        requiresTillToSellScope,
      });
      setSavedMessage(true);
      onSaved();
      setTimeout(() => setSavedMessage(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">{cashier.displayName}</h2>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* Requires till to sell */}
        <div className="rounded-xl border border-slate-200 p-3">
          <label className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">Requires an active till to sell</p>
              <p className="text-xs text-slate-400">
                When on, this cashier can't open a bill unless they have an active till for the
                shift.
              </p>
            </div>
            <input
              type="checkbox"
              checked={requiresTillToSell}
              onChange={(e) => setRequiresTillToSell(e.target.checked)}
              className="h-5 w-5 shrink-0 accent-emerald-600"
            />
          </label>

          {requiresTillToSell && (
            <div className="mt-3">
              <p className="text-sm font-medium text-slate-700">Which bills this applies to</p>
              <p className="mt-0.5 text-xs text-slate-400">
                "Priced cash only" gates just the cash bills with a fixed price. "All bills"
                gates every bill this cashier opens, including unpriced and non-cash ones.
              </p>
              <select
                value={requiresTillToSellScope}
                onChange={(e) => setRequiresTillToSellScope(e.target.value as TillGateScope)}
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 sm:w-auto"
              >
                <option value="priced_cash_only">Priced cash bills only</option>
                <option value="all_bills">All bills</option>
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        {savedMessage && <span className="text-sm font-medium text-emerald-600">Saved ✓</span>}
      </div>
    </div>
  );
}
