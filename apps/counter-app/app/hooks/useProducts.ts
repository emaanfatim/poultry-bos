"use client";

import { useCallback, useEffect, useState } from "react";
import type { Product } from "@repo/types";
import { fetchProducts } from "../services/products";
import { useAuth } from "../providers/AuthProvider";

export function useProducts() {
  const { token } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchProducts(token);
      setProducts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return { products, isLoading, error, reload: load };
}
