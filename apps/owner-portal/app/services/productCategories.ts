import type { ProductCategoryLite, ProductSubCategoryLite } from "../types/charges";
import { api } from "./api";

// GET /categories — used here as the source for the "product category" /
// "product sub-category" assignment-target pickers on the Tax & Charges page,
// and as the full category list on the Categories page.
export async function fetchProductCategories(token: string): Promise<ProductCategoryLite[]> {
  return api.get<ProductCategoryLite[]>("/categories", token);
}

export async function createProductCategory(
  token: string,
  payload: { name: string; token: string },
): Promise<ProductCategoryLite> {
  return api.post<ProductCategoryLite>("/categories", payload, token);
}

export async function deleteProductCategory(token: string, id: string): Promise<void> {
  await api.delete(`/categories/${id}`, token);
}

export async function createProductSubCategory(
  token: string,
  payload: { categoryId: string; name: string; token: string },
): Promise<ProductSubCategoryLite> {
  return api.post<ProductSubCategoryLite>("/categories/subcategories", payload, token);
}

export async function deleteProductSubCategory(token: string, id: string): Promise<void> {
  await api.delete(`/categories/subcategories/${id}`, token);
}
