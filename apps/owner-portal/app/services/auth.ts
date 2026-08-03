import type { LoginRequest, LoginResponse } from "@repo/types";
import { api } from "./api";

export async function login(credentials: LoginRequest): Promise<LoginResponse> {
  return api.post<LoginResponse>("/auth/login", credentials);
}

export async function getMe(token: string): Promise<{
  user: LoginResponse["user"];
  tenant: LoginResponse["tenant"];
  branch: LoginResponse["branch"];
}> {
  return api.get("/auth/me", token);
}
