import type { ProductCategoryLite } from "../types/charges";
import { api } from "./api";

// GET /categories — used here as the source for the "product category" /
// "product sub-category" assignment-target pickers on the Tax & Charges page.
export async function fetchProductCategories(token: string): Promise<ProductCategoryLite[]> {
  return api.get<ProductCategoryLite[]>("/categories", token);
}
