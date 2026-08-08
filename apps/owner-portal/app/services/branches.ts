import { api } from "./api";

export interface Branch {
  id: string;
  name: string;
}

export async function listBranches(token: string): Promise<{ branches: Branch[] }> {
  return api.get("/branches", token);
}
