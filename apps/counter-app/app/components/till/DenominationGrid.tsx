"use client";

import type { CurrencyDenomination } from "@repo/types";
import { useI18n } from "../../providers/I18nProvider";

interface Props {
  denominations: CurrencyDenomination[];
  quantities: Record<string, number>;
  onChange: (denominationId: string, quantity: number) => void;
  currencySymbol: string;
}

export function DenominationGrid({ denominations, quantities, onChange, currencySymbol }: Props) {
  const { t } = useI18n();

  const total = denominations.reduce((sum, d) => {
    const qty = quantities[d.id] ?? 0;
    return sum + qty * parseFloat(d.value);
  }, 0);

  return (
    <div className="rounded-xl border border-slate-200">
      <div className="grid grid-cols-3 gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500">
        <span>{t.till.denomination}</span>
        <span className="text-center">{t.till.quantity}</span>
        <span className="text-right">{t.pos.lineTotal}</span>
      </div>
      <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
        {denominations.map((d) => {
          const qty = quantities[d.id] ?? 0;
          const lineTotal = qty * parseFloat(d.value);
          return (
            <div key={d.id} className="grid grid-cols-3 items-center gap-2 px-4 py-2">
              <span className="text-sm font-medium text-slate-800">
                {currencySymbol} {parseFloat(d.value).toLocaleString()}
                <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-normal uppercase text-slate-500">
                  {d.type}
                </span>
              </span>
              <input
                type="number"
                min={0}
                step={1}
                value={qty === 0 ? "" : qty}
                onChange={(e) => onChange(d.id, Math.max(0, Number(e.target.value) || 0))}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-center text-sm focus:border-emerald-500 focus:outline-none"
                placeholder="0"
              />
              <span className="text-right text-sm text-slate-600">
                {lineTotal > 0 ? lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "—"}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3">
        <span className="text-sm font-semibold text-slate-700">{t.till.countedTotal}</span>
        <span className="text-lg font-bold text-slate-900">
          {currencySymbol} {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      </div>
    </div>
  );
}