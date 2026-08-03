"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../providers/AuthProvider";

export function Header() {
  const { user, tenant, branch, logout } = useAuth();
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

  return (
    <header className="border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Owner Portal</h1>
          <p className="text-xs text-slate-500">
            {tenant?.name} · {branch?.name}
          </p>
        </div>

        <nav className="flex flex-wrap items-center gap-1">
          {navLink("/dashboard/categories", "Categories")}
          {navLink("/dashboard/tax-charges", "Tax & Charges")}
          {navLink("/dashboard/staff/discounts", "Staff · Discounts")}
          {navLink("/dashboard/staff/till", "Staff · Till")}
        </nav>

        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-slate-600 sm:inline">
            {user?.displayName}
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}