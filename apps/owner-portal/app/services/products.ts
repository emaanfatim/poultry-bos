import type { Product } from "@repo/types";
import { api } from "./api";

export async function fetchProducts(token: string): Promise<Product[]> {
  const data = await api.get<{ products: Product[] }>("/products", token);
  return data.products;
}
