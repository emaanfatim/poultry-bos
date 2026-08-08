export type ProductStatus = "active" | "inactive";
export type UserRole = "owner" | "cashier" | "staff" | "manager" | "other";
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
  // Catalogue style (product-catalogue handover §2) — true once at least
  // one active Modifier Group is attached. There's no separate flag to set:
  // attaching/detaching groups on /products/:id/modifier-groups IS the switch
  // between "Simple" and "Modifiers" style for this product.
  hasModifiers?: boolean;
}

// ─── Modifier Groups — reusable customization library (handover §2/§3) ────

export type ModifierSelectionType = "single" | "multi";

export interface ModifierOption {
  id: string;
  modifierGroupId: string;
  label: string;
  // How many units of this option are included free before pricePerAdditionalUnit
  // starts applying (e.g. 1 free espresso shot, then +Rs 50 each after).
  includedFreeQuantity: number;
  pricePerAdditionalUnit: string;
  // null = unlimited
  maxQuantity: number | null;
  // Set when this option's price is pulled live from a real catalogue
  // product instead of being typed in (e.g. "Small Box" from Packaging).
  linkedProductId?: string | null;
  sortOrder: number;
}

export interface ModifierGroup {
  id: string;
  name: string;
  selectionType: ModifierSelectionType;
  isRequired: boolean;
  isPriced: boolean;
  // Set = a "Linked Group": options are derived live from the active
  // products in this sub-category (e.g. Packaging), never manually typed.
  linkedToSubCategoryId?: string | null;
  isActive: boolean;
  options: ModifierOption[];
}

// A group as attached to one specific product — sortOrder/isRequired here
// are that product's own view of the shared library group.
export interface ProductModifierGroup extends ModifierGroup {
  isRequiredOverride?: boolean | null;
}

// A modifier choice actually made on a cart/transaction line — mirrors
// transactionLineModifiers 1:1 (see database schema). Everything here is a
// snapshot (label/unitCharge) so it never drifts if the underlying
// modifier option is edited later.
export interface SelectedModifier {
  modifierGroupId: string;
  modifierOptionId: string;
  // Pre-composed as "Group: Option" (e.g. "Size: Large") at selection time,
  // so a receipt/ticket can render it standalone without re-fetching the
  // modifier group catalogue. Matches transactionLineModifiers.optionLabel.
  label: string;
  quantity: number;
  unitCharge: string;
  totalCharge: string;
}

export interface CartLineItem {
  // Unique identity for this cart line — just productId for a Simple
  // product, or productId + a signature of its modifier selections for a
  // Modifiers-style product. This is what lets two differently-customized
  // orders of the same base product (e.g. a Large Oat coffee and a Small
  // Almond coffee) sit as separate cart lines instead of merging.
  cartItemId: string;
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
  // Product-catalogue handover §3.1 — this line's chosen modifiers (Size,
  // Milk, Shots, etc.) and their combined charge. modifierTotal is a flat
  // addition to quantity×rate, not multiplied by quantity (matches the
  // server: lineTotal = base price × qty + modifierTotal).
  modifiers?: SelectedModifier[];
  modifierTotal?: string;
  // Free text, e.g. "no onions" — never priced, never shown on the
  // customer receipt, only on the kitchen/fulfillment ticket.
  kitchenNote?: string;
}

export interface TransactionLineItem {
  id?: string;
  productId: string;
  productName: string;
  unit: string;
  quantity: string;
  rate: string;
  modifierTotal?: string;
  lineTotal: string;
  kitchenNote?: string | null;
  modifiers?: SelectedModifier[];
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
  items: Array<{
    productId: string;
    quantity: number;
    unitId?: string;
    // Product-catalogue handover §3.1 — the cashier's modifier selections
    // for this line (Size, Milk, Shots, etc.). Server re-validates and
    // re-prices these against the product's attached modifier groups
    // rather than trusting the client's totalCharge.
    modifiers?: Array<{ modifierGroupId: string; modifierOptionId: string; quantity: number }>;
    // Free text, e.g. "no onions" — kitchen/fulfillment ticket only.
    kitchenNote?: string;
  }>;
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

export type SummaryPeriod = "hourly" | "daily" | "weekly" | "monthly" | "yearly";

export interface DailySummary {
  date: string;
  // Which period this summary covers. Omitted/undefined is treated as
  // "daily" for backward compatibility with older clients that only ever
  // requested today's summary.
  period?: SummaryPeriod;
  // Human-readable label for the covered range (e.g. "Aug 2026" for
  // monthly, "3–9 Aug 2026" for weekly). Always present; for "daily" it
  // matches what the client would compute from `date` itself, but is
  // provided so the client doesn't need period-specific date math.
  rangeLabel?: string;
  // Time-series buckets for the "Sales Trend" chart, at a granularity
  // matching the period (e.g. by hour for "daily", by day for "weekly",
  // by month for "yearly"). Always in chronological order.
  trend?: Array<{ label: string; fullLabel: string; revenue: string }>;
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
    // Modifier options selected on this specific sale — e.g. "Skin: Skin"
    // once, "Size: Medium" once. Only options that actually changed the
    // total show a nonzero totalCharge; free/descriptive options show
    // "0.00".
    modifiers: Array<{
      label: string;
      quantity: number;
      totalCharge: string;
    }>;
  }>;
}

export interface DraftItem {
  productId: string;
  productName: string;
  quantity: number;
  rate: string;
  unit: string;
  modifiers?: SelectedModifier[];
  kitchenNote?: string;
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
  // Cash sales made so far this shift, before the opening float is added
  // in — i.e. just the `net` half of currentCash. Only populated by
  // GET /till/current, shown alongside currentCash so cashiers see "how
  // much I've sold" without confusing it for "what's in the drawer".
  cashSalesToday?: string;
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

// ─── Receipt Designer ──────────────────────────────────────────────────────

// The fixed catalog of block kinds the designer can arrange. "divider" and
// "custom_text" may appear more than once in a template; every other kind
// is expected at most once (the UI doesn't enforce this — an extra one is
// simply rendered again).
export type ReceiptBlockType =
  | "logo_header"
  | "business_name"
  | "subtitle"
  | "divider"
  | "order_metadata"
  | "items_list"
  | "totals"
  | "payment_info"
  | "customer_info"
  | "notes"
  | "footer_message"
  | "custom_text";

export type ReceiptTextAlign = "left" | "center" | "right";

export interface ReceiptOrderMetadataFields {
  showInvoiceNumber: boolean;
  showDateTime: boolean;
  showCashier: boolean;
}

export interface ReceiptBlock {
  id: string;
  type: ReceiptBlockType;
  visible: boolean;
  // custom_text / business_name / subtitle / footer_message
  text?: string;
  align?: ReceiptTextAlign;
  bold?: boolean;
  // divider
  style?: "solid" | "dashed" | "double";
  // order_metadata
  metadataFields?: ReceiptOrderMetadataFields;
  // subtitle — each defaults to true when unset, so templates saved before
  // these existed keep behaving exactly as before (address/phone/branch
  // always shown alongside any override text).
  showAddress?: boolean;
  showPhone?: boolean;
  showBranchName?: boolean;
  // items_list
  showModifiers?: boolean;
  // totals
  showTaxBreakdown?: boolean;
  // payment_info
  showPaymentMethod?: boolean;
  // customer_info
  showCustomerName?: boolean;
  showCustomerPhone?: boolean;
  // logo_header — compressed data URL (e.g. "data:image/png;base64,..."),
  // same storage approach as product photos (see lib/image.ts). null/undefined
  // means no logo has been uploaded yet, in which case the block renders nothing.
  imageKey?: string | null;
}

export type ReceiptTemplatePresetId =
  | "minimal"
  | "classic"
  | "modern"
  | "branded"
  | "custom";

export interface ReceiptTemplateConfig {
  presetId: ReceiptTemplatePresetId;
  blocks: ReceiptBlock[];
}

export interface ReceiptTemplate {
  id: string;
  tenantId: string;
  // null = this is the tenant-wide default (applies to every branch that
  // has no override of its own).
  branchId: string | null;
  presetId: ReceiptTemplatePresetId;
  config: ReceiptTemplateConfig;
  updatedAt: string;
}