export type ProductStatus = "active" | "inactive";
export type UserRole = "owner" | "cashier";
export type BillType = "priced" | "unpriced";

export interface TenantConfig {
  id: string;
  name: string;
  currency: string;
  currencySymbol: string;
  address?: string | null;
  phone?: string | null;
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
  imageKey?: string | null;
}

export interface CartLineItem {
  productId: string;
  productName: string;
  unit: string;
  quantity: number;
  rate: string;
  lineTotal: string;
}

export interface TransactionLineItem {
  id?: string;
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
  type: string;
  status: string;
  paymentMethod: string;
  subtotal: string;
  total: string;
  notes?: string | null;
  createdAt: string;
  createdByName?: string | null;
  lineItems: TransactionLineItem[];
}

export interface AuthUser {
  id: string;
  tenantId: string;
  branchId: string;
  username: string;
  displayName: string;
  role: UserRole;
  /** Elevated permission — can issue Priced Bills and process wholesale/registered-tier transactions.
   *  Always true for owners; explicitly granted per cashier. (Section 13.5.2, 13.2.3, 13.16) */
  canIssuePricedBill: boolean;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
  tenant: TenantConfig;
  branch: { id: string; name: string; token: string };
}

export interface CreateSaleRequest {
  items: Array<{ productId: string; quantity: number }>;
  paymentMethod?: string;
  notes?: string;
}

export interface DailySummary {
  date: string;
  totalRevenue: string;
  transactionCount: number;
  avgOrderValue: string;
  productBreakdown: Array<{
    productId: string;
    productName: string;
    totalQuantity: string;
    unit: string;
    totalRevenue: string;
  }>;
}
