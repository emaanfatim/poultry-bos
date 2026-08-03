import { api } from "./api";

export type TillGateScope = "all_bills" | "priced_cash_only";

export interface CashierTillRow {
  id: string;
  username: string;
  displayName: string;
  isActive: boolean;
  requiresTillToSell: boolean;
  requiresTillToSellScope: TillGateScope;
  requiresTillCount: boolean;
}

export interface UpdateCashierTillSettingsRequest {
  requiresTillToSell?: boolean;
  requiresTillToSellScope?: TillGateScope;
  requiresTillCount?: boolean;
}

export async function fetchCashierTillSettings(token: string): Promise<CashierTillRow[]> {
  const data = await api.get<{ cashiers: CashierTillRow[] }>("/till-settings", token);
  return data.cashiers;
}

export async function updateCashierTillSettings(
  token: string,
  userId: string,
  patch: UpdateCashierTillSettingsRequest,
): Promise<CashierTillRow> {
  const data = await api.patch<{ cashier: CashierTillRow }>(
    `/till-settings/${userId}`,
    patch,
    token,
  );
  return data.cashier;
}