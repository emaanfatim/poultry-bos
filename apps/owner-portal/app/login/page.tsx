"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "../providers/AuthProvider";
import { GuestGuard } from "../components/AuthGuard";

export default function LoginPage() {
  const { login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid username or password");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <GuestGuard>
      <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 px-4">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-xl font-bold text-white shadow-md">
              P
            </div>
            <p className="text-sm font-medium text-slate-400">Poultry BOS</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
            <div className="mb-8 text-center">
              <h1 className="text-2xl font-bold text-slate-900">Owner Portal</h1>
              <p className="mt-2 text-sm text-slate-500">Sign in with your owner account</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="username" className="mb-1 block text-sm font-medium text-slate-700">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 pr-16 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex items-center px-4 text-xs font-medium text-slate-500 hover:text-slate-700"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-xl bg-emerald-600 py-3.5 font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </GuestGuard>
  );
}