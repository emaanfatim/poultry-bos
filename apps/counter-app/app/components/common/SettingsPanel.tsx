"use client";

import { useEffect, useRef, useState } from "react";
import { Settings, X, Sun, Moon, Check } from "lucide-react";
import {
  ACCENT_COLORS,
  useTheme,
  type Density,
} from "../../providers/ThemeProvider";

const ACCENT_SWATCH_CLASSES: Record<string, string> = {
  green: "bg-emerald-600",
  brown: "bg-amber-800",
  orange: "bg-orange-600",
  rose: "bg-rose-600",
  indigo: "bg-indigo-600",
  blue: "bg-blue-600",
  purple: "bg-purple-600",
  teal: "bg-teal-600",
};

const DENSITY_OPTIONS: { value: Density; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "balanced", label: "Balanced" },
  { value: "comfy", label: "Comfy" },
];

export function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const {
    appearance,
    accent,
    density,
    setAppearance,
    setAccent,
    setDensity,
  } = useTheme();

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const selectedAccentLabel =
    ACCENT_COLORS.find((c) => c.value === accent)?.label ?? "";

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Settings"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
      >
        <Settings size={18} />
      </button>

      {open && (
        <div
          className="absolute right-0 z-50 mt-2 w-80 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl"
          role="dialog"
          aria-label="Appearance settings"
        >
          <div className="mb-4 flex items-start justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-2)] text-[var(--foreground)]">
                <Settings size={16} />
              </span>
              <div>
                <p className="text-sm font-semibold text-[var(--foreground)]">
                  Settings
                </p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Personalize your workspace
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close settings"
              className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              <X size={16} />
            </button>
          </div>

          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Appearance
          </p>
          <div className="mb-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAppearance("light")}
              className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                appearance === "light"
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--surface-2)]"
              }`}
            >
              <Sun size={14} />
              Light
            </button>
            <button
              type="button"
              onClick={() => setAppearance("dark")}
              className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                appearance === "dark"
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--surface-2)]"
              }`}
            >
              <Moon size={14} />
              Night
            </button>
          </div>

          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              Accent Color
            </p>
            <p className="text-[11px] font-medium text-[var(--foreground)]">
              {selectedAccentLabel}
            </p>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            {ACCENT_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setAccent(c.value)}
                aria-label={c.label}
                title={c.label}
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${ACCENT_SWATCH_CLASSES[c.value]} ring-2 ring-offset-2 ring-offset-[var(--surface)] transition-shadow ${
                  accent === c.value
                    ? "ring-[var(--accent)]"
                    : "ring-transparent"
                }`}
              >
                {accent === c.value && (
                  <Check size={14} className="text-white" strokeWidth={3} />
                )}
              </button>
            ))}
          </div>

          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Display Density
          </p>
          <div className="mb-4 grid grid-cols-3 gap-2">
            {DENSITY_OPTIONS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setDensity(d.value)}
                className={`rounded-xl border px-2 py-2 text-xs font-medium transition-colors ${
                  density === d.value
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--surface-2)]"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-[var(--border)] pt-3">
            <p className="text-[11px] text-[var(--muted-foreground)]">
              More settings coming soon
            </p>
            <p className="text-[11px] text-[var(--muted-foreground)]">v1.0</p>
          </div>
        </div>
      )}
    </div>
  );
}