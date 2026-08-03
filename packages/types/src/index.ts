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

export interface TransactionChargeLine {
  id: string;
  transactionLineItemId?: string | null;
  chargeCategoryId: string;
  chargeRateLineId: string;
  categoryName: string;
  categoryType: "tax" | "surcharge" | "other";
  calculationType: "fixed" | "percentage";
  rateValue: string;
  baseAmount: string;
  calculatedAmount: string;
  includedInOtherCategoryBase: boolean;
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
  discountType?: DiscountType | null;
  discountAmount?: string;
  // Subtotal after discount, before charges — discountedSubtotal + all
  // charges (tax/surcharge/other) = trueTotal, before any cash rounding.
  trueTotal?: string;
  total: string;
  roundingAdjustment?: string;
  roundingMethod?: string | null;
  notes?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  createdAt: string;
  createdByName?: string | null;
  lineItems: TransactionLineItem[];
  chargeLines?: TransactionChargeLine[];
}

export type TillGateScope = "all_bills" | "priced_cash_only";

export interface AuthUser {
  id: string;
  tenantId: string;
  branchId: string;
  username: string;
  displayName: string;
  role: UserRole;
  canIssuePricedBill: boolean;
  requiresTillCount: boolean;
  // Whether this cashier must have an open till session before they can
  // create any sale. Enforced server-side (fresh DB read, not this JWT
  // claim, since it can change mid-shift); also used client-side to decide
  // whether to route to /till/open before allowing POS access.
  requiresTillToSell: boolean;
  // Only meaningful when requiresTillToSell is true. "all_bills" blocks
  // every sale type until the till is open; "priced_cash_only" only
  // blocks priced/cash sales (the ones that actually touch till math) and
  // lets unpriced/miscellaneous/non-cash sales through regardless.
  requiresTillToSellScope: TillGateScope;
  canReceiveHandover: boolean;
  // Legacy per-staff permission from when the cashier chose the rounding
  // method at checkout. Rounding is now decided by the owner per payment
  // method (see PaymentMethod.roundingMethod), so this no longer gates
  // anything in the sale flow; kept for backward compatibility.
  canApplyCustomRounding: boolean;
  // §7 — "billing.create_miscellaneous" in the handover doc; per-staff-ID,
  // not role-wide.
  canCreateMiscellaneousBills: boolean;
  // Discount module — per-staff-ID grant. canApplyDiscount gates the
  // discount field in the POS UI entirely. The two max fields are
  // independent caps (null = that discount type isn't permitted at all for
  // this cashier); discountRestrictedToProducts tells the UI the discount
  // will only be calculated against approved products, not the whole cart.
  canApplyDiscount: boolean;
  maxDiscountPercentage: string | null;
  maxDiscountFlatAmount: string | null;
  discountRestrictedToProducts: boolean;
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
  // Owner-decided (Tax & Charges > Payment Methods) rounding rule applied
  // automatically whenever requiresRounding is true. The cashier no longer
  // picks this per-sale at checkout.
  roundingMethod: "exact" | "round_up" | "round_down";
  isActive: boolean;
}

export type DiscountType = "percentage" | "flat";

export interface CreateSaleRequest {
  items: Array<{ productId: string; quantity: number; unitId?: string }>;
  paymentMethodId: string;
  notes?: string;
  billType?: BillType;
  customerName?: string;
  customerPhone?: string;
  discount?: { type: DiscountType; value: number };
}

// Discount module — owner-configured per-cashier caps, managed from the
// Owner Portal's Staff > Discounts screen.
export type DiscountBillTypeScope = "priced_only" | "priced_and_unpriced";

export interface CashierDiscountSettings {
  userId: string;
  canApplyDiscount: boolean;
  maxDiscountPercentage: string | null;
  maxDiscountFlatAmount: string | null;
  discountRestrictedToProducts: boolean;
  // Only meaningful when discountRestrictedToProducts = true.
  allowedProductIds: string[];
  // Same idea, scoped to whole product categories instead of individual
  // products. Independent of discountRestrictedToProducts — when both are
  // on, a line item is eligible if it matches either list.
  discountRestrictedToCategories: boolean;
  // Only meaningful when discountRestrictedToCategories = true.
  allowedCategoryIds: string[];
  // Which bill types this cashier's discount grant actually reaches —
  // priced bills only, or priced + unpriced (credit/delivery-note) bills
  // alike. Never reaches miscellaneous bills either way.
  discountBillTypeScope: DiscountBillTypeScope;
  // Charges/Tax module — null means "use this payment method's own rule"
  // (PaymentMethod.roundingMethod); otherwise overrides it for just this
  // cashier, whichever payment method they check out on.
  roundingMethodOverride: "exact" | "round_up" | "round_down" | null;
}

export interface UpdateCashierDiscountSettingsRequest {
  canApplyDiscount?: boolean;
  // Explicit null clears that cap (discount type becomes disallowed);
  // omit to leave unchanged.
  maxDiscountPercentage?: number | null;
  maxDiscountFlatAmount?: number | null;
  discountRestrictedToProducts?: boolean;
  // Full replacement of the allowed-product list; omit to leave unchanged.
  allowedProductIds?: string[];
  discountRestrictedToCategories?: boolean;
  // Full replacement of the allowed-category list; omit to leave unchanged.
  allowedCategoryIds?: string[];
  discountBillTypeScope?: DiscountBillTypeScope;
  // Explicit null clears the override (falls back to the payment method's
  // own rule); omit to leave unchanged.
  roundingMethodOverride?: "exact" | "round_up" | "round_down" | null;
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
    subtotal: string;
    discountType?: DiscountType | null;
    discountAmount?: string;
    roundingAdjustment?: string;
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

export interface TillRoundingSummary {
  // Total collected on top of itemized bills — bills rounded UP (or a
  // custom amount above the true total) during this session.
  extraReceived: number;
  // Total given up below itemized bills — bills rounded DOWN (or a custom
  // amount below the true total). This is the "no Rs 7 note, gave a 10
  // instead" case, already reflected in the bill total rather than
  // requiring separate cashier bookkeeping.
  extraGiven: number;
  // extraReceived - extraGiven.
  net: number;
  transactionCount: number;
}

export interface TillSession {
  id: string;
  status: TillSessionStatus;
  userId: string;
  userName?: string;
  branchId: string;
  openingCash: string;
  // Live running cash-in-drawer for an OPEN session — openingCash plus net
  // "priced" cash sales made so far this shift. Only populated by
  // GET /till/current; absent on closed sessions (use actualClosingCash /
  // expectedClosingCash there instead).
  currentCash?: string;
  expectedClosingCash?: string | null;
  actualClosingCash?: string | null;
  variance?: string | null;
  openedAt: string;
  closedAt?: string | null;
  handoverId?: string | null;
  openingCounts?: DenominationCountLine[];
  closingCounts?: DenominationCountLine[];
  // Populated on GET /till/current and POST /till/close — breakdown of
  // rounding-driven extra cash given/received during this session.
  roundingSummary?: TillRoundingSummary;
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