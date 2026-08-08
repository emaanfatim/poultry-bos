import { api } from "./api";

export type CreatableStaffRole = "cashier" | "staff" | "manager" | "other";

export interface CreateStaffAccountRequest {
  username: string;
  password: string;
  displayName: string;
  phone?: string;
  role: CreatableStaffRole;
  branchId: string;
}

export interface StaffAccount {
  id: string;
  username: string;
  displayName: string;
  phone: string | null;
  role: "owner" | CreatableStaffRole;
  isActive: boolean;
  branchId?: string;
}

// POST /users — owner-only. Creates a new cashier/staff login for one of
// the owner's branches. branchId is sent explicitly in the body (not
// inferred from X-Branch-Id) so the owner can create an account on a
// branch other than whichever one they currently have selected.
export async function createStaffAccount(
  token: string,
  payload: CreateStaffAccountRequest,
): Promise<StaffAccount> {
  const data = await api.post<{ user: StaffAccount }>("/users", payload, token);
  return data.user;
}

// GET /users — accounts for whichever branch is currently active (the
// owner's X-Branch-Id selection, attached automatically by the api client).
export async function fetchStaffAccounts(token: string): Promise<StaffAccount[]> {
  const data = await api.get<{ users: StaffAccount[] }>("/users", token);
  return data.users;
}
