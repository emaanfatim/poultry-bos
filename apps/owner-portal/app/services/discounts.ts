import type { CashierDiscountSettings, UpdateCashierDiscountSettingsRequest } from "@repo/types";
import { api } from "./api";

export interface CashierListRow {
  id: string;
  username: string;
  displayName: string;
  isActive: boolean;
  canApplyDiscount: boolean;
  maxDiscountPercentage: string | null;
  maxDiscountFlatAmount: string | null;
  discountRestrictedToProducts: boolean;
  discountRestrictedToCategories: boolean;
  discountBillTypeScope: "priced_only" | "priced_and_unpriced";
  roundingMethodOverride: "exact" | "round_up" | "round_down" | null;
}

export async function fetchCashiers(token: string): Promise<CashierListRow[]> {
  const data = await api.get<{ cashiers: CashierListRow[] }>("/discount-settings", token);
  return data.cashiers;
}

export async function fetchCashierDiscountSettings(
  token: string,
  userId: string,
): Promise<CashierDiscountSettings> {
  const data = await api.get<{ settings: CashierDiscountSettings }>(
    `/discount-settings/${userId}`,
    token,
  );
  return data.settings;
}

export async function updateCashierDiscountSettings(
  token: string,
  userId: string,
  patch: UpdateCashierDiscountSettingsRequest,
): Promise<CashierDiscountSettings> {
  const data = await api.patch<{ settings: CashierDiscountSettings }>(
    `/discount-settings/${userId}`,
    patch,
    token,
  );
  return data.settings;
}