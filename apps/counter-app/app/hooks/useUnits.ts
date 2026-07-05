"use client";

import { useCallback, useEffect, useState } from "react";
import type { Unit } from "@repo/types";
import { api } from "../services/api";
import { useAuth } from "../providers/AuthProvider";

export function useUnits(activeOnly = false) {
  const { token } = useAuth();
  const [units, setUnits] = useState<Unit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const path = activeOnly ? "/units/active" : "/units";
      const data = await api.get<{ units: Unit[] }>(path, token);
      setUnits(data.units);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load units");
    } finally {
      setIsLoading(false);
    }
  }, [token, activeOnly]);

  useEffect(() => { load(); }, [load]);

  const createUnit = useCallback(async (body: {
    name: string;
    code: string;
    type: string;
    isBase: boolean;
    baseUnitId?: string | null;
    conversionFactor?: string | null;
  }) => {
    if (!token) throw new Error("Not authenticated");
    const data = await api.post<{ unit: Unit }>("/units", body, token);
    setUnits((prev) => [...prev, data.unit]);
    return data.unit;
  }, [token]);

  const updateUnit = useCallback(async (unitId: string, body: {
    name: string;
    conversionFactor?: string | null;
  }) => {
    if (!token) throw new Error("Not authenticated");
    const data = await api.put<{ unit: Unit }>(`/units/${unitId}`, body, token);
    setUnits((prev) => prev.map((u) => u.id === unitId ? data.unit : u));
    return data.unit;
  }, [token]);

  const toggleUnit = useCallback(async (unitId: string) => {
    if (!token) throw new Error("Not authenticated");
    const data = await api.post<{ unit: Unit }>(`/units/${unitId}/toggle`, {}, token);
    setUnits((prev) => prev.map((u) => u.id === unitId ? { ...u, isActive: data.unit.isActive } : u));
  }, [token]);

  // Helper: get all active weight units for a product's unit type
  const getSameTypeUnits = useCallback((unit: Unit) => {
    return units.filter((u) => u.type === unit.type && u.isActive);
  }, [units]);

  // Helper: convert a quantity from one unit to another via base unit
  const convert = useCallback((quantity: number, fromUnit: Unit, toUnit: Unit): number | null => {
    if (fromUnit.id === toUnit.id) return quantity;
    if (fromUnit.type !== toUnit.type) return null;

    // Convert fromUnit → base unit quantity
    let baseQty: number;
    if (fromUnit.isBase) {
      baseQty = quantity;
    } else {
      const factor = parseFloat(fromUnit.conversionFactor ?? "0");
      if (!factor) return null;
      baseQty = quantity * factor;
    }

    // Convert base unit → toUnit
    if (toUnit.isBase) {
      return baseQty;
    } else {
      const factor = parseFloat(toUnit.conversionFactor ?? "0");
      if (!factor) return null;
      return baseQty / factor;
    }
  }, []);

  return {
    units,
    isLoading,
    error,
    reload: load,
    createUnit,
    updateUnit,
    toggleUnit,
    getSameTypeUnits,
    convert,
  };
}
