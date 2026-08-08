"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../../providers/AuthProvider";
import { useBranch } from "../../../providers/BranchProvider";
import { AuthGuard } from "../../../components/AuthGuard";
import { Header } from "../../../components/Header";
import {
  createStaffAccount,
  fetchStaffAccounts,
  type CreatableStaffRole,
  type StaffAccount,
} from "../../../services/staffAccounts";

const ROLE_LABELS: Record<CreatableStaffRole, string> = {
  cashier: "Cashier",
  staff: "Staff",
  manager: "Manager",
  other: "Other",
};

export default function StaffAccountsPage() {
  return (
    <AuthGuard>
      <Header />
      <StaffAccountsContent />
    </AuthGuard>
  );
}

function StaffAccountsContent() {
  const { token, user } = useAuth();
  const { branches, activeBranchId } = useBranch();

  const [accounts, setAccounts] = useState<StaffAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");

  async function refreshAccounts() {
    if (!token) return;
    try {
      const rows = await fetchStaffAccounts(token);
      setAccounts(rows);
      setListError("");
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    // Re-list whenever the owner switches the active branch in the header,
    // since the list (like the create form's default branch) follows it.
    fetchStaffAccounts(token)
      .then((rows) => {
        setAccounts(rows);
        setListError("");
      })
      .catch((e) => setListError(e instanceof Error ? e.message : "Failed to load accounts"))
      .finally(() => setLoading(false));
  }, [token, activeBranchId]);

  // The owner's own account also lives in `users` (pinned to a branch like
  // everyone else), but this page is only for accounts the owner creates —
  // so it's filtered out of the list here rather than at the API level,
  // since GET /users is shared with other consumers that do need it.
  const staffOnlyAccounts = accounts.filter((account) => account.role !== "owner");

  if (user?.role !== "owner") {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-slate-500">Access denied — owners only.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Staff · Accounts</h1>
      <p className="mb-8 text-sm text-slate-500">
        Create a login for a cashier or other staff member and assign them to a branch. Till
        and discount permissions can be set afterwards from Staff · Till and Staff ·
        Discounts.
      </p>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <CreateAccountForm
          token={token!}
          branches={branches}
          defaultBranchId={activeBranchId}
          onCreated={refreshAccounts}
        />

        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            Accounts on this branch
          </h2>
          {listError && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {listError}
            </div>
          )}
          {loading ? (
            <div className="text-center text-slate-400">Loading…</div>
          ) : staffOnlyAccounts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
              No accounts on this branch yet.
            </div>
          ) : (
            <div className="space-y-2">
              {staffOnlyAccounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {account.displayName}{" "}
                      <span className="font-normal text-slate-400">@{account.username}</span>
                    </p>
                    <p className="text-xs text-slate-400">
                      {account.role === "owner" ? "Owner" : ROLE_LABELS[account.role]}
                      {account.phone ? ` · ${account.phone}` : ""}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      account.isActive
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {account.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateAccountForm({
  token,
  branches,
  defaultBranchId,
  onCreated,
}: {
  token: string;
  branches: { id: string; name: string }[];
  defaultBranchId: string | null;
  onCreated: () => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<CreatableStaffRole>("cashier");
  // null = owner hasn't explicitly picked a branch yet, so fall back to
  // whichever branch is active in the header. Derived directly at render
  // time (no effect needed) so it stays in sync as the owner switches
  // branches, right up until they deliberately choose one here themselves.
  const [chosenBranchId, setChosenBranchId] = useState<string | null>(null);
  const branchId = chosenBranchId ?? defaultBranchId ?? "";

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSavedMessage(false);

    if (!branchId) {
      setError("Choose a branch");
      return;
    }

    setSaving(true);
    try {
      await createStaffAccount(token, {
        displayName: displayName.trim(),
        username: username.trim(),
        password,
        phone: phone.trim() || undefined,
        role,
        branchId,
      });
      setDisplayName("");
      setUsername("");
      setPassword("");
      setPhone("");
      setRole("cashier");
      setChosenBranchId(null);
      setSavedMessage(true);
      onCreated();
      setTimeout(() => setSavedMessage(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create account");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="h-fit rounded-2xl border border-slate-200 bg-white p-5"
    >
      <h2 className="mb-4 text-lg font-semibold text-slate-900">New staff account</h2>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <Field label="Full name">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            placeholder="e.g. Ahmed Raza"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--accent-border)] focus:ring-2 focus:ring-[var(--accent-soft-strong)]"
          />
        </Field>

        <Field label="Username" hint="Used to log in on the counter till.">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
            placeholder="e.g. ahmed.cashier"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--accent-border)] focus:ring-2 focus:ring-[var(--accent-soft-strong)]"
          />
        </Field>

        <Field label="Password" hint="At least 6 characters. Share this with the staff member directly.">
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            placeholder="Set a login password"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--accent-border)] focus:ring-2 focus:ring-[var(--accent-soft-strong)]"
          />
        </Field>

        <Field label="Phone number" hint="Optional">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. 0300-1234567"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--accent-border)] focus:ring-2 focus:ring-[var(--accent-soft-strong)]"
          />
        </Field>

        <Field label="Role">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as CreatableStaffRole)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--accent-border)] focus:ring-2 focus:ring-[var(--accent-soft-strong)]"
          >
            <option value="cashier">Cashier</option>
            <option value="staff">Staff</option>
            <option value="manager">Manager</option>
            <option value="other">Other</option>
          </select>
        </Field>

        <Field label="Branch">
          <select
            value={branchId}
            onChange={(e) => setChosenBranchId(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--accent-border)] focus:ring-2 focus:ring-[var(--accent-soft-strong)]"
          >
            <option value="" disabled>
              Choose a branch
            </option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {saving ? "Creating…" : "Create account"}
        </button>
        {savedMessage && (
          <span className="text-sm font-medium text-[var(--accent)]">Account created ✓</span>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}
