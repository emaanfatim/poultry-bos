export type ProductStatus = "active" | "inactive";
export type UserRole = "owner" | "cashier";
export type BillType = "priced" | "unpriced" | "miscellaneous";
export type UnitType = "weight" | "volume" | "count";

export interface TenantConfig {
  id: string;
  name: string;
  currency: string;
  currencySymbol: string;
  address?: string | null;
  phone?: string | null;
}

export interface Unit {
  id: string;
  name: string;
  code: string;
  type: UnitType;
  isBase: boolean;
  baseUnitId?: string | null;
  baseUnitCode?: string | null;
  conversionFactor?: string | null;
  isActive: boolean;
}

export interface Product {
  id: string;
  token: string;
  name: string;
  unit: Unit; // the unit currentPrice is denominated in
  units?: Unit[]; // units a cashier may sell this in (superset including `unit`)
  currentPrice: string;
  status: ProductStatus;
  categoryName: string;
  subCategoryName: string;
  imageKey?: string | null;
}

export interface CartLineItem {
  productId: string;
  productName: string;
  unit: Unit;
  quantity: number;
  rate: string;
  lineTotal: string;
  // Carried so a cart line can be switched to a different sellable unit later
  // (e.g. kg → maund) without losing the original price.
  basePrice?: string;
  priceUnit?: Unit;
  sellableUnits?: Unit[];
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
  paymentMethodId: string;
  paymentMethodName: string;
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
  requiresTillCount: boolean;
  canReceiveHandover: boolean;
  // §4.1 — gates the Round Down and Custom cash-rounding options at checkout.
  canApplyCustomRounding: boolean;
  // §7 — "billing.create_miscellaneous" in the handover doc; per-staff-ID,
  // not role-wide.
  canCreateMiscellaneousBills: boolean;
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

export interface PaymentMethod {
  id: string;
  name: string;
  requiresRounding: boolean;
  isActive: boolean;
}

export interface CreateSaleRequest {
  items: Array<{ productId: string; quantity: number; unitId?: string }>;
  paymentMethodId: string;
  notes?: string;
  billType?: BillType;
  customerName?: string;
  customerPhone?: string;
  roundingMethod?: "exact" | "round_up" | "round_down" | "custom";
  customAmount?: number;
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

// ─── Till module ────────────────────────────────────────────────────────

export type DenominationType = "note" | "coin";
export type TillSessionStatus = "open" | "closed";
export type TillCountType = "opening" | "closing";

export interface CurrencyDenomination {
  id: string;
  value: string;
  type: DenominationType;
  isActive: boolean;
}

export interface DenominationCountLine {
  denominationId: string;
  value: string;
  type: DenominationType;
  quantity: number;
}

export interface TillSession {
  id: string;
  status: TillSessionStatus;
  userId: string;
  userName?: string;
  branchId: string;
  openingCash: string;
  expectedClosingCash?: string | null;
  actualClosingCash?: string | null;
  variance?: string | null;
  openedAt: string;
  closedAt?: string | null;
  handoverId?: string | null;
  openingCounts?: DenominationCountLine[];
  closingCounts?: DenominationCountLine[];
}

export interface OpenTillRequest {
  openingCash: number;
  denominationCounts?: Array<{ denominationId: string; quantity: number }>;
}

export interface CloseTillRequest {
  actualClosingCash: number;
  denominationCounts?: Array<{ denominationId: string; quantity: number }>;
}

export interface TillHandover {
  id: string;
  receivedBy: string;
  receivedByName?: string;
  branchId: string;
  totalExpected: string;
  totalReceived: string;
  variance: string;
  createdAt: string;
  sessions: TillSession[];
}

export interface CreateHandoverRequest {
  tillSessionIds: string[];
  totalReceived: number;
}

export interface TillReportRow {
  userId: string;
  userName: string;
  sessionId: string;
  status: TillSessionStatus;
  openingCash: string;
  expectedClosingCash?: string | null;
  actualClosingCash?: string | null;
  variance?: string | null;
  openedAt: string;
  closedAt?: string | null;
  handedOver: boolean;
}

export interface TillReportSummary {
  date: string;
  rows: TillReportRow[];
  totalVariance: string;
  openSessionsCount: number;
  closedSessionsCount: number;
}

export interface CashierTillSettings {
  userId: string;
  requiresTillCount: boolean;
  canReceiveHandover: boolean;
  reportsToId?: string | null;
}