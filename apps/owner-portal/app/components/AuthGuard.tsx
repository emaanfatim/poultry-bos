"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../providers/AuthProvider";

export function AuthGuard({ children }: { children: ReactNode }) {
  const { token, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !token) {
      router.replace("/login");
    }
  }, [isLoading, token, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50">
        <p className="text-slate-600">Loading…</p>
      </div>
    );
  }

  if (!token) return null;

  return <>{children}</>;
}

export function GuestGuard({ children }: { children: ReactNode }) {
  const { token, isLoading, sessionExpired } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && token) {
      router.replace("/dashboard/staff/discounts");
    }
  }, [isLoading, token, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50">
        <p className="text-slate-600">Loading…</p>
      </div>
    );
  }

  if (token) return null;

  return (
    <>
      {sessionExpired && (
        <div className="fixed inset-x-0 top-0 z-50 bg-amber-500 px-4 py-3 text-center text-sm font-medium text-white shadow-md">
          ⚠️ Your session has expired. Please log in again.
        </div>
      )}
      {children}
    </>
  );
}
