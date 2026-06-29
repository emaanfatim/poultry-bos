"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AuthUser, LoginResponse, TenantConfig } from "@repo/types";
import { getMe, login as loginRequest } from "../services/sales";

const STORAGE_KEY = "bos_counter_session";

interface SessionData {
  token: string;
  user: AuthUser;
  tenant: TenantConfig;
  branch: { id: string; name: string; token: string };
}

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  tenant: TenantConfig | null;
  branch: SessionData["branch"] | null;
  isLoading: boolean;
  isOwner: boolean;
  canIssuePricedBill: boolean;
  sessionExpired: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadSession(): SessionData | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

function saveSession(session: SessionData | null) {
  if (session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    const stored = loadSession();
    if (!stored) {
      setIsLoading(false);
      return;
    }

    getMe(stored.token)
      .then((data) => {
        setSession({
          token: stored.token,
          user: data.user,
          tenant: data.tenant,
          branch: data.branch,
        });
      })
      .catch(() => {
        saveSession(null);
        setSessionExpired(true);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const data = await loginRequest({ username, password });
    const nextSession: SessionData = {
      token: data.token,
      user: data.user,
      tenant: data.tenant,
      branch: data.branch,
    };
    saveSession(nextSession);
    setSession(nextSession);
    setSessionExpired(false);
  }, []);

  const logout = useCallback(() => {
    saveSession(null);
    setSession(null);
    setSessionExpired(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token: session?.token ?? null,
      user: session?.user ?? null,
      tenant: session?.tenant ?? null,
      branch: session?.branch ?? null,
      isLoading,
      isOwner: session?.user.role === "owner",
      canIssuePricedBill: Boolean(session?.user),
      sessionExpired,
      login,
      logout,
    }),
    [session, isLoading, sessionExpired, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
