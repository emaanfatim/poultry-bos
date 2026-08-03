"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../../providers/AuthProvider";
import { useI18n } from "../../providers/I18nProvider";
import { useTill } from "../../providers/TillProvider";
import { formatCurrency } from "../../services/sales";

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
            ? "bg-emerald-600 text-white"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
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
    <header className="border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">{t.app.title}</h1>
          <p className="text-xs text-slate-500">
            {tenant?.name} · {branch?.name}
          </p>
        </div>

        {tillSession && (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs">
            <div className="flex flex-col leading-tight">
              <span className="text-slate-400">{t.till.headerStartTill}</span>
              <span className="font-semibold text-slate-700">
                {formatCurrency(tillSession.openingCash, symbol)}
              </span>
            </div>
            <span className="text-slate-300">|</span>
            <div className="flex flex-col leading-tight">
              <span className="text-slate-400">{t.till.headerCurrentTill}</span>
              <span className="font-semibold text-emerald-700">
                {formatCurrency(tillSession.currentCash ?? tillSession.openingCash, symbol)}
              </span>
            </div>
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
          <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs">
            {languages.map(({ code, label }) => (
              <button
                key={code}
                type="button"
                onClick={() => setLocale(code)}
                className={`rounded-md px-3 py-1 transition-colors ${
                  locale === code
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="hidden text-sm text-slate-600 sm:inline">
            {user?.displayName}
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50"
          >
            {t.nav.logout}
          </button>
        </div>
      </div>
    </header>
  );
}