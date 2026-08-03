"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { TillSession } from "@repo/types";
import { useAuth } from "./AuthProvider";
import { fetchCurrentTillSession } from "../services/till";

interface TillContextValue {
  // undefined = not checked yet, null = no till open right now
  session: TillSession | null | undefined;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const TillContext = createContext<TillContextValue | null>(null);

// Fallback poll so the "Current Till" figure stays fresh even across tabs /
// devices without anyone explicitly calling refresh() (e.g. someone else on
// the same till, or a stale tab left open). Sale completion still calls
// refresh() directly for an instant update on the cashier's own screen.
const POLL_INTERVAL_MS = 30_000;

export function TillProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [session, setSession] = useState<TillSession | null | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const refresh = useCallback(async () => {
    const currentToken = tokenRef.current;
    if (!currentToken) {
      setSession(undefined);
      return;
    }
    try {
      const next = await fetchCurrentTillSession(currentToken);
      setSession(next);
    } catch {
      // Leave the last-known session in place on a transient failure —
      // don't flash the till widget away because one poll failed.
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setSession(undefined);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    fetchCurrentTillSession(token)
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setIsLoading(false));

    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [token, refresh]);

  const value = useMemo<TillContextValue>(
    () => ({ session, isLoading, refresh }),
    [session, isLoading, refresh],
  );

  return <TillContext.Provider value={value}>{children}</TillContext.Provider>;
}

export function useTill() {
  const context = useContext(TillContext);
  if (!context) {
    throw new Error("useTill must be used within TillProvider");
  }
  return context;
}
