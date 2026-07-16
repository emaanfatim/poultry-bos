import type {
  CreateSaleRequest,
  DailySummary,
  LoginRequest,
  LoginResponse,
  PaymentMethod,
  Transaction,
} from "@repo/types";
import { api } from "./api";

export async function fetchPaymentMethods(token: string): Promise<PaymentMethod[]> {
  const data = await api.get<{ paymentMethods: PaymentMethod[] }>("/payment-methods", token);
  return data.paymentMethods;
}

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

export async function createSale(
  token: string,
  sale: CreateSaleRequest,
): Promise<Transaction> {
  const data = await api.post<{ transaction: Transaction }>("/sales", sale, token);
  return data.transaction;
}

export async function fetchDailySummary(token: string): Promise<DailySummary> {
  const data = await api.get<{ summary: DailySummary }>("/sales/daily-summary", token);
  return data.summary;
}

export async function fetchTransaction(
  token: string,
  id: string,
): Promise<Transaction> {
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

export function calcLineTotal(quantity: number, rate: string): string {
  return (quantity * parseFloat(rate)).toFixed(2);
}