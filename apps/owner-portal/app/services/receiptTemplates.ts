import type { ReceiptTemplate, ReceiptTemplateConfig } from "@repo/types";
import { api } from "./api";

export type ReceiptTemplateScope = "branch" | "tenant";

export interface SaveReceiptTemplateRequest extends ReceiptTemplateConfig {
  scope: ReceiptTemplateScope;
}

export async function fetchReceiptTemplate(
  token: string,
  scope: ReceiptTemplateScope,
): Promise<ReceiptTemplate | null> {
  const data = await api.get<{ template: ReceiptTemplate | null }>(
    `/receipt-templates?scope=${scope}`,
    token,
  );
  return data.template;
}

export async function saveReceiptTemplate(
  token: string,
  payload: SaveReceiptTemplateRequest,
): Promise<ReceiptTemplate> {
  const data = await api.put<{ template: ReceiptTemplate }>(
    "/receipt-templates",
    payload,
    token,
  );
  return data.template;
}

export async function clearBranchReceiptTemplate(token: string): Promise<void> {
  await api.delete<{ success: boolean }>("/receipt-templates?scope=branch", token);
}
