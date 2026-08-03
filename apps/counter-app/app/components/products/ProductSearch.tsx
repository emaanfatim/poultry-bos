"use client";

import { useI18n } from "../../providers/I18nProvider";

interface ProductSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function ProductSearch({ value, onChange }: ProductSearchProps) {
  const { t } = useI18n();

  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={t.pos.searchPlaceholder}
      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
    />
  );
}
