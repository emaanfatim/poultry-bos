import { useState, useCallback } from "react";
import type { Draft, CreateDraftRequest } from "@repo/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

async function apiFetch<T>(
  path: string,
  token: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error ?? "Request failed");
  }
  return res.json();
}

export function useDrafts(token: string | null) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDrafts = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ drafts: Draft[] }>("/drafts", token);
      setDrafts(data.drafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load drafts");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const saveDraft = useCallback(
    async (request: CreateDraftRequest): Promise<Draft> => {
      if (!token) throw new Error("Not authenticated");
      const data = await apiFetch<{ draft: Draft }>("/drafts", token, {
        method: "POST",
        body: JSON.stringify(request),
      });
      setDrafts((prev) => [...prev, data.draft]);
      return data.draft;
    },
    [token],
  );

  const deleteDraft = useCallback(
    async (draftId: string) => {
      if (!token) return;
      await apiFetch(`/drafts/${draftId}`, token, { method: "DELETE" });
      setDrafts((prev) => prev.filter((d) => d.id !== draftId));
    },
    [token],
  );

  return {
    drafts,
    isLoading,
    error,
    fetchDrafts,
    saveDraft,
    deleteDraft,
  };
}
