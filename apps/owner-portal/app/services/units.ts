import type { Unit } from "@repo/types";
import { api } from "./api";

export async function fetchUnits(token: string): Promise<Unit[]> {
  const data = await api.get<{ units: Unit[] }>("/units", token);
  return data.units;
}

export async function createUnit(
  token: string,
  payload: {
    name: string;
    code: string;
    type: "weight" | "volume" | "count";
    isBase: boolean;
    baseUnitId?: string | null;
    conversionFactor?: string | null;
  },
): Promise<Unit> {
  const data = await api.post<{ unit: Unit }>("/units", payload, token);
  return data.unit;
}

export async function updateUnit(
  token: string,
  id: string,
  payload: { name: string; conversionFactor?: string | null },
): Promise<Unit> {
  const data = await api.put<{ unit: Unit }>(`/units/${id}`, payload, token);
  return data.unit;
}

export async function toggleUnit(token: string, id: string): Promise<Unit> {
  const data = await api.patch<{ unit: Unit }>(`/units/${id}/toggle`, {}, token);
  return data.unit;
}

export async function deleteUnit(token: string, id: string): Promise<void> {
  await api.delete(`/units/${id}`, token);
}
