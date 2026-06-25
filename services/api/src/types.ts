import type { AuthUser } from "@repo/types";

export type AppVariables = {
  tenantId: string;
  user: AuthUser;
  branchId: string;
  branchToken: string;
};
