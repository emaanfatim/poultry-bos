"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../../providers/AuthProvider";
import { useI18n } from "../../providers/I18nProvider";
import { useTill } from "../../providers/TillProvider";
import { formatCurrency } from "../../services/sales";
import { SettingsPanel } from "./SettingsPanel";

export function Header() {
  const { user, tenant, branch, isOwner, canReceiveHandover, logout } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const { session: tillSession } = useTill();
  const pathname = usePathname();
  const router = useRouter();
  const symbol = tenant?.currencySymbol ?? "Rs";

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const navLink = (href: string, label: string) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          active
            ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
            : "text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
        }`}
      >
        {label}
      </Link>
    );
  };

  const languages = [
    { code: "en", label: "EN" },
    { code: "ur", label: "UR" },
    { code: "ne", label: "BOTH" },
  ] as const;

  return (
    <header className="border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-sm">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-[var(--foreground)]">{t.app.title}</h1>
          <p className="text-xs text-[var(--muted-foreground)]">
            {tenant?.name} · {branch?.name}
          </p>
        </div>

        {tillSession && (
          <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-xs">
            <div className="flex flex-col leading-tight">
              <span className="text-[var(--muted-foreground)]">{t.till.headerStartTill}</span>
              <span className="font-semibold text-[var(--foreground)]">
                {formatCurrency(tillSession.openingCash, symbol)}
              </span>
            </div>
            <span className="text-[var(--border)]">|</span>
            <div className="flex flex-col leading-tight">
              <span className="text-[var(--muted-foreground)]">{t.till.headerCurrentTill}</span>
              <span className="font-semibold text-[var(--accent-hover)]">
                {formatCurrency(tillSession.currentCash ?? tillSession.openingCash, symbol)}
              </span>
            </div>
            {tillSession.cashSalesToday !== undefined && (
              <>
                <span className="text-[var(--border)]">|</span>
                <div className="flex flex-col leading-tight">
                  <span className="text-[var(--muted-foreground)]">{t.till.headerSalesToday}</span>
                  <span className="font-semibold text-[var(--foreground)]">
                    {formatCurrency(tillSession.cashSalesToday, symbol)}
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        <nav className="flex flex-wrap items-center gap-1">
          {navLink("/pos", t.nav.pos)}
          {isOwner && navLink("/prices", t.nav.prices)}
          {navLink("/summary", t.nav.summary)}
          {navLink("/till/close", t.nav.till)}
          {canReceiveHandover && navLink("/till/handover", t.nav.handover)}
          {canReceiveHandover && navLink("/till/report", t.till.reportTitle)}
        </nav>

        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-[var(--border)] p-0.5 text-xs">
            {languages.map(({ code, label }) => (
              <button
                key={code}
                type="button"
                onClick={() => setLocale(code)}
                className={`rounded-md px-3 py-1 transition-colors ${
                  locale === code
                    ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--surface-2)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="hidden text-sm text-[var(--foreground)] sm:inline">
            {user?.displayName}
          </span>
          <SettingsPanel />
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--foreground)] transition-colors hover:bg-[var(--surface-2)]"
          >
            {t.nav.logout}
          </button>
        </div>
      </div>
    </header>
  );
}