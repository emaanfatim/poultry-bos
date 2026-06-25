export type UserRole = "owner" | "cashier";

export type ProductStatus = "active" | "inactive";

export type TransactionStatus = "draft" | "completed" | "voided" | "refunded";

export type TransactionType = "sale" | "purchase";

export type PaymentMethod = "cash" | "mobile_wallet" | "card";

export interface AuthUser {
  id: string;
  tenantId: string;
  branchId: string;
  username: string;
  displayName: string;
  role: UserRole;
}

export interface TenantConfig {
  id: string;
  name: string;
  currency: string;
  currencySymbol: string;
}

export interface Product {
  id: string;
  token: string;
  name: string;
  unit: string;
  currentPrice: string;
  status: ProductStatus;
  categoryName: string;
  subCategoryName: string;
}

export interface CartLineItem {
  productId: string;
  productName: string;
  unit: string;
  quantity: number;
  rate: string;
  lineTotal: string;
}

export interface SaleLineItemInput {
  productId: string;
  quantity: number;
}

export interface CreateSaleRequest {
  items: SaleLineItemInput[];
  paymentMethod?: PaymentMethod;
}

export interface TransactionLineItem {
  id: string;
  productId: string;
  productName: string;
  unit: string;
  quantity: string;
  rate: string;
  lineTotal: string;
}

export interface Transaction {
  id: string;
  receiptNumber: string;
  type: TransactionType;
  status: TransactionStatus;
  paymentMethod: PaymentMethod;
  subtotal: string;
  total: string;
  createdAt: string;
  createdByName: string;
  lineItems: TransactionLineItem[];
}

export interface DailySummary {
  date: string;
  totalRevenue: string;
  transactionCount: number;
  productBreakdown: Array<{
    productId: string;
    productName: string;
    totalQuantity: string;
    unit: string;
    totalRevenue: string;
  }>;
}

export interface UpdateProductPriceRequest {
  currentPrice: string;
}

export interface BulkPriceUpdate {
  productId: string;
  currentPrice: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
  tenant: TenantConfig;
  branch: { id: string; name: string; token: string };
}
