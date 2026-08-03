import type { PaymentMethod } from "../types/charges";
import { api } from "./api";

export async function fetchPaymentMethods(
  token: string,
  includeInactive = false,
): Promise<PaymentMethod[]> {
  const query = includeInactive ? "?includeInactive=1" : "";
  const data = await api.get<{ paymentMethods: PaymentMethod[] }>(
    `/payment-methods${query}`,
    token,
  );
  return data.paymentMethods;
}

export async function createPaymentMethod(
  token: string,
  payload: { name: string; requiresRounding?: boolean; roundingMethod?: PaymentMethod["roundingMethod"] },
): Promise<PaymentMethod> {
  const data = await api.post<{ paymentMethod: PaymentMethod }>(
    "/payment-methods",
    payload,
    token,
  );
  return data.paymentMethod;
}

export async function updatePaymentMethod(
  token: string,
  id: string,
  patch: {
    name?: string;
    requiresRounding?: boolean;
    roundingMethod?: PaymentMethod["roundingMethod"];
    isActive?: boolean;
  },
): Promise<PaymentMethod> {
  const data = await api.put<{ paymentMethod: PaymentMethod }>(
    `/payment-methods/${id}`,
    patch,
    token,
  );
  return data.paymentMethod;
}

export async function deactivatePaymentMethod(
  token: string,
  id: string,
): Promise<PaymentMethod> {
  const data = await api.delete<{ paymentMethod: PaymentMethod }>(
    `/payment-methods/${id}`,
    token,
  );
  return data.paymentMethod;
}
