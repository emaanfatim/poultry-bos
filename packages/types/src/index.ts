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
  billType: BillType;
  subtotal: string;
  total: string;
  notes?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
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
  canIssuePricedBill: boolean;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
  tenant: TenantConfig;
  branch: { id: string; name: string; token: string };
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface CreateSaleRequest {
  items: Array<{ productId: string; quantity: number }>;
  paymentMethod?: string;
  notes?: string;
  billType?: BillType;
  customerName?: string;
  customerPhone?: string;
}

export interface BulkPriceUpdate {
  productId: string;
  price: string;
}

export interface DailySummary {
  date: string;
  totalRevenue: string;
  transactionCount: number;
  avgOrderValue: string;
  billTypeBreakdown: {
    priced: { count: number; revenue: string };
    unpriced: { count: number; revenue: string };
  };
  productBreakdown: Array<{
    productId: string;
    productName: string;
    totalQuantity: string;
    unit: string;
    totalRevenue: string;
  }>;
  transactions: Array<{
    id: string;
    receiptNumber: string;
    billType: BillType;
    total: string;
    customerName?: string | null;
    customerPhone?: string | null;
    createdAt: string;
  }>;
}

export interface DraftItem {
  productId: string;
  productName: string;
  quantity: number;
  rate: string;
  unit: string;
}

export interface Draft {
  id: string;
  draftNumber: number;
  customerName?: string | null;
  customerPhone?: string | null;
  items: DraftItem[];
  subtotal: string;
  createdAt: string;
  createdByName?: string;
}

export interface CreateDraftRequest {
  customerName?: string;
  customerPhone?: string;
  items: DraftItem[];
  subtotal: string;
}
