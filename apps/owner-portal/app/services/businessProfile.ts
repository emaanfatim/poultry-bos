import type { LoginResponse } from "@repo/types";
import { api } from "./api";

export interface UpdateBusinessProfileRequest {
  address?: string | null;
  phone?: string | null;
  branchName?: string;
}

export interface UpdateBusinessProfileResponse {
  tenant: LoginResponse["tenant"];
  branch: LoginResponse["branch"];
}

export async function updateBusinessProfile(
  token: string,
  payload: UpdateBusinessProfileRequest,
): Promise<UpdateBusinessProfileResponse> {
  return api.put<UpdateBusinessProfileResponse>("/business-profile", payload, token);
}
