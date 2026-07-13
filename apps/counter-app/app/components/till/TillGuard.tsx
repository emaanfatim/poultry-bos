"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { TillSession } from "@repo/types";
import { useAuth } from "../../providers/AuthProvider";
import { useI18n } from "../../providers/I18nProvider";
import { fetchCurrentTillSession } from "../../services/till";

export function TillGuard({ children }: { children: ReactNode }) {
  const { token, isLoading: authLoading } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [session, setSession] = useState<TillSession | null | undefined>(undefined);

  useEffect(() => {
    if (authLoading || !token) return;
    fetchCurrentTillSession(token)
      .then(setSession)
      .catch(() => setSession(null));
  }, [authLoading, token]);

  useEffect(() => {
    if (session === null) {
      router.replace("/till/open");
    }
  }, [session, router]);

  if (authLoading || session === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-600">{t.common.loading}</p>
      </div>
    );
  }

  if (session === null) return null;

  return <>{children}</>;
}