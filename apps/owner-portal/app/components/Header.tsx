"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../providers/AuthProvider";
import { useBranch } from "../providers/BranchProvider";
import { SettingsPanel } from "./SettingsPanel";

export function Header() {
  const { user, tenant, branch, logout } = useAuth();
  const { branches, activeBranchId, isLoading: branchesLoading, switchBranch } = useBranch();
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
            ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
            : "text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-[var(--foreground)]">
            Owner Portal
          </h1>
          <p className="text-xs text-[var(--muted-foreground)]">{tenant?.name}</p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {branches.length > 1 ? (
            <select
              value={activeBranchId ?? ""}
              onChange={(e) => switchBranch(e.target.value)}
              disabled={branchesLoading}
              aria-label="Switch branch"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--surface-2)] disabled:opacity-60"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="hidden text-sm text-[var(--muted-foreground)] sm:inline">
              {branch?.name}
            </span>
          )}
          <span className="hidden text-sm text-[var(--foreground)] sm:inline">
            {user?.displayName}
          </span>
          <SettingsPanel />
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--foreground)] transition-colors hover:bg-[var(--surface-2)]"
          >
            Log out
          </button>
        </div>
      </div>

      <nav className="mx-auto mt-2 flex max-w-7xl flex-wrap items-center gap-1">
        {navLink("/dashboard/summary", "Summary")}
        {navLink("/dashboard/categories", "Categories")}
        {navLink("/dashboard/products", "Products")}
        {navLink("/dashboard/modifier-groups", "Modifier Groups")}
        {navLink("/dashboard/units", "Units")}
        {navLink("/dashboard/tax-charges", "Tax & Charges")}
        {navLink("/dashboard/receipt-designer", "Receipt Designer")}
        {navLink("/dashboard/staff/accounts", "Staff · Accounts")}
        {navLink("/dashboard/staff/discounts", "Staff · Discounts")}
        {navLink("/dashboard/staff/till", "Staff · Till")}
      </nav>
    </header>
  );
}