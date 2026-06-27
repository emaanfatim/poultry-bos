"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../../providers/AuthProvider";
import { useI18n } from "../../providers/I18nProvider";

export function Header() {
  const { user, tenant, branch, isOwner, logout } = useAuth();
  const { t, locale, setLocale } = useI18n();

  const pathname = usePathname();
  const router = useRouter();

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
        {/* Logo / Business */}
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            {t.app.title}
          </h1>
          <p className="text-xs text-slate-500">
            {tenant?.name} · {branch?.name}
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex flex-wrap items-center gap-1">
          {navLink("/pos", t.nav.pos)}
          {isOwner && navLink("/prices", t.nav.prices)}
          {navLink("/summary", t.nav.summary)}
        </nav>

        {/* User Controls */}
        <div className="flex items-center gap-3">
          {/* Language Switcher */}
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

          {/* Logged-in User */}
          <span className="hidden text-sm text-slate-600 sm:inline">
            {user?.displayName}
          </span>

          {/* Logout */}
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