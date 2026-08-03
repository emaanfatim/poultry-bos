"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { TillSession } from "@repo/types";
import { useAuth } from "../../providers/AuthProvider";
import { useI18n } from "../../providers/I18nProvider";
import { fetchCurrentTillSession } from "../../services/till";

// Gates access to children until an open till session exists — but only
// for cashiers the owner has marked requiresTillToSell = true. Everyone
// else passes straight through, till open or not, per-cashier and
// changeable by the owner at any time (Owner Portal → Staff → Till).
export function TillGuard({ children }: { children: ReactNode }) {
  const { token, user, isLoading: authLoading } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [session, setSession] = useState<TillSession | null | undefined>(undefined);

  const tillMandatory = Boolean(user?.requiresTillToSell);

  useEffect(() => {
    if (authLoading || !token || !tillMandatory) return;
    fetchCurrentTillSession(token)
      .then(setSession)
      .catch(() => setSession(null));
  }, [authLoading, token, tillMandatory]);

  useEffect(() => {
    if (tillMandatory && session === null) {
      router.replace("/till/open");
    }
  }, [tillMandatory, session, router]);

  if (!tillMandatory) return <>{children}</>;

  if (authLoading || session === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50">
        <p className="text-slate-600">{t.common.loading}</p>
      </div>
    );
  }

  if (session === null) return null;

  return <>{children}</>;
}