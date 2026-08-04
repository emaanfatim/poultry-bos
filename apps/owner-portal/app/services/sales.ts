import type { DailySummary, Transaction } from "@repo/types";
import { api } from "./api";

export async function fetchDailySummary(token: string): Promise<DailySummary> {
  const data = await api.get<{ summary: DailySummary }>("/sales/daily-summary", token);
  return data.summary;
}

export async function fetchTransaction(token: string, id: string): Promise<Transaction> {
  const data = await api.get<{ transaction: Transaction }>(`/sales/${id}`, token);
  return data.transaction;
}

export function formatCurrency(amount: string | number, symbol: string): string {
  const value = typeof amount === "string" ? parseFloat(amount) : amount;
  return `${symbol} ${value.toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}