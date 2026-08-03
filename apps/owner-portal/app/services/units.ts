import type { Unit } from "@repo/types";
import { api } from "./api";

export async function fetchUnits(token: string): Promise<Unit[]> {
  const data = await api.get<{ units: Unit[] }>("/units", token);
  return data.units;
}
