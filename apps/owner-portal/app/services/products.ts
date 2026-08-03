import type { Product } from "@repo/types";
import { api } from "./api";

export async function fetchProducts(token: string): Promise<Product[]> {
  const data = await api.get<{ products: Product[] }>("/products", token);
  return data.products;
}

export interface CreateProductPayload {
  subCategoryId: string;
  name: string;
  token: string;
  unitId: string;
  currentPrice: string;
  isServiceItem?: boolean;
  // Extra units the product can also be sold in (its priced unit is
  // always included automatically, no need to repeat it here).
  sellableUnitIds?: string[];
  // Compressed data URL (e.g. "data:image/webp;base64,...") — see lib/image.ts
  imageKey?: string | null;
}

export async function createProduct(
  token: string,
  payload: CreateProductPayload,
): Promise<Product> {
  const data = await api.post<{ product: Product }>("/products", payload, token);
  return data.product;
}

export interface UpdateProductPayload {
  name?: string;
  token?: string;
  subCategoryId?: string;
  status?: "active" | "inactive";
  imageKey?: string | null;
}

export async function updateProduct(
  token: string,
  productId: string,
  payload: UpdateProductPayload,
): Promise<Product> {
  const data = await api.patch<{ product: Product }>(
    `/products/${productId}`,
    payload,
    token,
  );
  return data.product;
}

export async function setProductPrice(
  token: string,
  productId: string,
  currentPrice: string,
): Promise<Product> {
  const data = await api.put<{ product: Product }>(
    `/products/${productId}/price`,
    { currentPrice },
    token,
  );
  return data.product;
}

export async function setProductUnits(
  token: string,
  productId: string,
  unitIds: string[],
): Promise<{ success: boolean; unitIds: string[] }> {
  return api.put(`/products/${productId}/units`, { unitIds }, token);
}
