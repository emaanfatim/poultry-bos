import type { BulkPriceUpdate, Product, ProductModifierGroup } from "@repo/types";
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

export async function setProductSellableUnits(
  token: string,
  productId: string,
  unitIds: string[],
): Promise<void> {
  await api.put(`/products/${productId}/units`, { unitIds }, token);
}

export async function fetchProductModifierGroups(
  token: string,
  productId: string,
): Promise<ProductModifierGroup[]> {
  const data = await api.get<{ modifierGroups: ProductModifierGroup[] }>(
    `/products/${productId}/modifier-groups`,
    token,
  );
  return data.modifierGroups;
}
