import type { ModifierGroup, ModifierSelectionType } from "@repo/types";
import { api } from "./api";

// ─── Payload types ────────────────────────────────────────────────────────────

export interface ModifierOptionPayload {
  label: string;
  includedFreeQuantity: number;
  pricePerAdditionalUnit: string;
  maxQuantity: number | null;
  linkedProductId: string | null;
  sortOrder: number;
}

export interface ModifierGroupPayload {
  name: string;
  selectionType: ModifierSelectionType;
  isRequired: boolean;
  isPriced: boolean;
  linkedToSubCategoryId: string | null;
  // Ignored by the server when linkedToSubCategoryId is set — options for
  // linked groups are derived live from the sub-category, not typed here.
  options: ModifierOptionPayload[];
  // Only used on PATCH (activate a previously deactivated group).
  isActive?: boolean;
}

// ─── API calls ────────────────────────────────────────────────────────────────

/** GET /modifier-groups — full library, options included. */
export async function fetchModifierGroups(
  token: string,
  includeInactive = false,
): Promise<ModifierGroup[]> {
  const qs = includeInactive ? "?includeInactive=true" : "";
  const data = await api.get<{ modifierGroups: ModifierGroup[] }>(
    `/modifier-groups${qs}`,
    token,
  );
  return data.modifierGroups;
}

/** GET /modifier-groups/:id — single group with options. */
export async function fetchModifierGroup(
  token: string,
  groupId: string,
): Promise<ModifierGroup> {
  const data = await api.get<{ modifierGroup: ModifierGroup }>(
    `/modifier-groups/${groupId}`,
    token,
  );
  return data.modifierGroup;
}

/** POST /modifier-groups — create a new group (owner only). */
export async function createModifierGroup(
  token: string,
  payload: ModifierGroupPayload,
): Promise<ModifierGroup> {
  const data = await api.post<{ modifierGroup: ModifierGroup }>(
    "/modifier-groups",
    payload,
    token,
  );
  return data.modifierGroup;
}

/** PATCH /modifier-groups/:id — update name/options/flags (owner only). */
export async function updateModifierGroup(
  token: string,
  groupId: string,
  payload: Partial<ModifierGroupPayload>,
): Promise<ModifierGroup> {
  const data = await api.patch<{ modifierGroup: ModifierGroup }>(
    `/modifier-groups/${groupId}`,
    payload,
    token,
  );
  return data.modifierGroup;
}

/**
 * DELETE /modifier-groups/:id — soft-deactivates the group (owner only).
 * Existing product attachments and historical transaction lines are
 * preserved; the group just stops appearing in the active library.
 */
export async function deleteModifierGroup(
  token: string,
  groupId: string,
): Promise<void> {
  await api.delete(`/modifier-groups/${groupId}`, token);
}

/**
 * DELETE /modifier-groups/:id/permanent — permanently removes the group
 * (owner only). Fails with a clear message if it's still attached to a
 * product or was ever used on a past sale — deactivate in those cases
 * instead.
 */
export async function permanentlyDeleteModifierGroup(
  token: string,
  groupId: string,
): Promise<void> {
  await api.delete(`/modifier-groups/${groupId}/permanent`, token);
}