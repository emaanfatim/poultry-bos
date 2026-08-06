import type { ReceiptTemplate } from "@repo/types";
import { api } from "./api";

// Resolves to this staff member's branch override if the owner saved one,
// otherwise the tenant-wide default, otherwise null — meaning no template
// has been configured yet and the built-in default receipt layout should
// be used as-is.
export async function fetchResolvedReceiptTemplate(
  token: string,
): Promise<ReceiptTemplate | null> {
  const data = await api.get<{ template: ReceiptTemplate | null }>(
    "/receipt-templates/resolve",
    token,
  );
  return data.template;
}
