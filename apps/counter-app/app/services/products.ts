import type { BulkPriceUpdate, Product } from "@repo/types";
import { api } from "./api";

export async function fetchProducts(token: string): Promise<Product[]> {
  const data = await api.get<{ products: Product[] }>("/products", token);
  return data.products;
}

export async function updatePrices(
  token: string,
  prices: BulkPriceUpdate[],
): Promise<void> {
  await api.put("/products/prices", { prices }, token);
}
