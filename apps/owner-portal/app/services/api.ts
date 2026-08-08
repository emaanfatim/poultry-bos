import { getActiveBranchId } from "./branchContext";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // Owner Portal branch switcher — every request carries whichever branch
  // the owner currently has selected, so branch-scoped endpoints (business
  // profile, receipt templates, till settings, charges, sales summary,
  // etc.) act on that branch instead of the branch the owner's account
  // happens to be pinned to. Ignored server-side for non-owner tokens.
  const activeBranchId = getActiveBranchId();
  if (activeBranchId) {
    headers["X-Branch-Id"] = activeBranchId;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(data.error ?? "Request failed", response.status);
  }

  return data as T;
}

export const api = {
  get: <T>(path: string, token?: string | null) => request<T>(path, {}, token),
  post: <T>(path: string, body: unknown, token?: string | null) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }, token),
  put: <T>(path: string, body: unknown, token?: string | null) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }, token),
  patch: <T>(path: string, body: unknown, token?: string | null) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }, token),
  delete: <T>(path: string, token?: string | null) =>
    request<T>(path, { method: "DELETE" }, token),
};
