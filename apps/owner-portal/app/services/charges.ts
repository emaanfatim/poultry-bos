import type {
  ChargeAssignment,
  ChargeCategory,
  ChargeCategoryPayload,
  AssignmentLevel,
  OverrideType,
} from "../types/charges";
import { api } from "./api";

// GET /charge-categories — current versions only, optionally scoped to a branch.
export async function fetchChargeCategories(
  token: string,
  branchId?: string | null,
): Promise<ChargeCategory[]> {
  const query = branchId ? `?branchId=${branchId}` : "";
  const data = await api.get<{ chargeCategories: ChargeCategory[] }>(
    `/charge-categories${query}`,
    token,
  );
  return data.chargeCategories;
}

export async function createChargeCategory(
  token: string,
  payload: ChargeCategoryPayload,
): Promise<ChargeCategory> {
  const data = await api.post<{ chargeCategory: ChargeCategory }>(
    "/charge-categories",
    payload,
    token,
  );
  return data.chargeCategory;
}

// PUT — edit = new version server-side (handover §6); the response id is
// the NEW current version's id, so callers should replace their local copy
// wholesale rather than patching in place.
export async function updateChargeCategory(
  token: string,
  currentId: string,
  payload: ChargeCategoryPayload,
): Promise<ChargeCategory> {
  const data = await api.put<{ chargeCategory: ChargeCategory }>(
    `/charge-categories/${currentId}`,
    payload,
    token,
  );
  return data.chargeCategory;
}

// DELETE — soft delete (isActive=false as a new version), never a hard
// delete, so historical bills keep resolving against the version they used.
export async function deactivateChargeCategory(
  token: string,
  currentId: string,
): Promise<ChargeCategory> {
  const data = await api.delete<{ chargeCategory: ChargeCategory }>(
    `/charge-categories/${currentId}`,
    token,
  );
  return data.chargeCategory;
}

export async function fetchAssignments(
  token: string,
  chargeCategoryId: string,
): Promise<ChargeAssignment[]> {
  const data = await api.get<{ assignments: ChargeAssignment[] }>(
    `/charge-assignments?chargeCategoryId=${chargeCategoryId}`,
    token,
  );
  return data.assignments;
}

export async function createAssignment(
  token: string,
  payload: {
    chargeCategoryId: string;
    assignmentLevel: AssignmentLevel;
    targetId: string;
    overrideType?: OverrideType;
    rateOverrideCalculationType?: "fixed" | "percentage" | null;
    rateOverrideValue?: string | null;
  },
): Promise<ChargeAssignment> {
  const data = await api.post<{ assignment: ChargeAssignment }>(
    "/charge-assignments",
    payload,
    token,
  );
  return data.assignment;
}

export async function deleteAssignment(token: string, id: string): Promise<void> {
  await api.delete(`/charge-assignments/${id}`, token);
}
