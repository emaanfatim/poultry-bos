import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("PKR"),
  currencySymbol: text("currency_symbol").notNull().default("Rs"),
  address: text("address"),
  phone: text("phone"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const branches = pgTable(
  "branches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    token: text("token").notNull(),
    // Charges/Tax module §9.1 — accrual vs cash basis for tax REPORTING only.
    // Never affects when/how tax is calculated or stored on a bill (§4/§5
    // always run at confirmation time regardless of this setting).
    taxReportingBasis: text("tax_reporting_basis", { enum: ["accrual", "cash"] })
      .notNull()
      .default("accrual"),
    // Charges/Tax module §9 — free text, not hardcoded to any country
    // (e.g. "FBR", "ATO") plus the branch's registration number with that
    // authority (e.g. STRN/ABN).
    regulatoryAuthorityName: text("regulatory_authority_name"),
    regulatoryRegistrationNumber: text("regulatory_registration_number"),
    // Charges/Tax module §4.1 — interactive cash-rounding settings. Nullable:
    // a branch that never assigns a requiresRounding=true payment method
    // never needs these set. "1.00" / "0.50" are sane starting defaults for
    // a whole-currency-unit rounding rule; owners can change per branch.
    roundingIncrement: numeric("rounding_increment", { precision: 10, scale: 2 }).default("1.00"),
    roundingThreshold: numeric("rounding_threshold", { precision: 4, scale: 2 }).default("0.50"),
    // §4.1 Custom entry validation bounds. Null customEntryStepMultiple means
    // no step-multiple check is enforced, only the max-deviation check.
    customEntryMaxDeviation: numeric("custom_entry_max_deviation", { precision: 10, scale: 2 }),
    customEntryStepMultiple: numeric("custom_entry_step_multiple", { precision: 10, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("branches_tenant_token_idx").on(table.tenantId, table.token),
  ],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role", { enum: ["owner", "cashier"] })
      .notNull()
      .default("cashier"),
    isActive: boolean("is_active").notNull().default(true),
    // Till module — per-cashier settings (Handover doc, Part 1 §2 and §6).
    // Whether this cashier must enter an itemized denomination breakdown when
    // opening/closing a till, rather than just a lump-sum amount.
    requiresTillCount: boolean("requires_till_count").notNull().default(false),
    // Till module — whether this cashier MUST have an open till session to
    // create any sale at all. Off by default (a cashier can sell without
    // ever opening a till, e.g. small branches that don't track cash
    // shift-by-shift); the owner opts specific cashiers into this. This is
    // independent of requiresTillCount above — that one only controls
    // whether opening/closing itself needs an itemized denomination count,
    // not whether opening is mandatory before selling.
    requiresTillToSell: boolean("requires_till_to_sell").notNull().default(false),
    // Only meaningful when requiresTillToSell = true. Owner's choice of how
    // wide the gate is: "all_bills" blocks any sale (priced, unpriced, or
    // miscellaneous) until the till is open — treats an open till as "this
    // cashier is on shift, full stop." "priced_cash_only" only blocks the
    // sale types that actually touch the till's cash math (priced + cash
    // payment method); unpriced delivery notes and non-cash payments go
    // through regardless, since they were never going to affect the drawer.
    requiresTillToSellScope: text("requires_till_to_sell_scope", {
      enum: ["all_bills", "priced_cash_only"],
    })
      .notNull()
      .default("all_bills"),
    // Whether this staff member is allowed to receive/confirm an end-of-day
    // handover from other cashiers (i.e. can act as a "Chief Cashier").
    canReceiveHandover: boolean("can_receive_handover").notNull().default(false),
    // Reporting line: which staff member this cashier's cash rolls up to at
    // handover time. Nullable — not everyone needs a supervisor set.
    reportsToId: uuid("reports_to_id"),
    // Charges/Tax module §4.1 — gates the Round Down and Custom rounding
    // options at checkout (till.custom_cash_amount in the handover doc).
    // Kept as a simple per-user flag, consistent with requiresTillCount /
    // canReceiveHandover above, rather than introducing a generic RBAC
    // catalog this codebase doesn't otherwise have.
    canApplyCustomRounding: boolean("can_apply_custom_rounding").notNull().default(false),
    // Charges/Tax module — optional per-cashier override of which rounding
    // rule applies whenever this cashier closes a sale on a payment method
    // that requiresRounding. Null (default) means "use that payment
    // method's own rule" (see PaymentMethod.roundingMethod); set it to make
    // just this cashier round differently — e.g. owner wants Cashier A to
    // always round up and Cashier B to always round down, even though both
    // use the same Cash payment method. Same per-staff-ID grant pattern as
    // canApplyDiscount below, rather than a generic RBAC catalog.
    roundingMethodOverride: text("rounding_method_override", {
      enum: ["exact", "round_up", "round_down"],
    }),
    // §7 — "billing.create_miscellaneous" in the handover doc. Same
    // per-staff-ID boolean pattern as canApplyCustomRounding above, rather
    // than introducing a generic RBAC catalog this codebase doesn't
    // otherwise have. Grantable per staff member, not role-wide.
    canCreateMiscellaneousBills: boolean("can_create_miscellaneous_bills")
      .notNull()
      .default(false),
    // Discount module — per-staff-ID grant, same pattern as
    // canApplyCustomRounding / canCreateMiscellaneousBills above. False by
    // default: a cashier cannot apply any discount until the owner turns
    // this on and sets at least one of the two caps below.
    canApplyDiscount: boolean("can_apply_discount").notNull().default(false),
    // Independent caps — a cashier can be allowed one, the other, or both,
    // since the discount is entered at checkout as either RS or %. Null
    // means that discount type is not permitted for this cashier at all;
    // "0.00" would mean permitted but capped at nothing, which isn't useful,
    // so null is used instead of 0 to mean "not allowed".
    maxDiscountPercentage: numeric("max_discount_percentage", { precision: 5, scale: 2 }),
    maxDiscountFlatAmount: numeric("max_discount_flat_amount", { precision: 10, scale: 2 }),
    // When true, this cashier's discount is only allowed to apply against
    // the subtotal of products listed in cashier_discount_products below —
    // any cart containing other, non-listed products still checks out fine,
    // the discount is simply calculated against the eligible portion only
    // (see sales.ts §4 step 3). When false, the discount applies to the
    // whole bill subtotal as before.
    discountRestrictedToProducts: boolean("discount_restricted_to_products")
      .notNull()
      .default(false),
    // Same idea as discountRestrictedToProducts, but scoped to whole product
    // CATEGORIES instead of hand-picked individual products — lets an owner
    // grant "discount anything in Feed" without ticking every product in
    // that category one by one. Independent of discountRestrictedToProducts;
    // when both are on, a line item is eligible if it matches EITHER list
    // (see sales.ts §4 step 3 — union, not intersection). When only this one
    // is on, eligibility is by category alone.
    discountRestrictedToCategories: boolean("discount_restricted_to_categories")
      .notNull()
      .default(false),
    // Discount module — which bill types this cashier's discount grant
    // actually reaches. "priced_only" keeps discounting off unpriced
    // (credit / delivery-note) bills entirely, even though those bills carry
    // a subtotal the same way a priced bill does — some owners only want
    // discounting to happen at the counter on cash-and-carry sales, not
    // baked into running credit that gets settled later. Default
    // "priced_and_unpriced" matches the pre-existing behavior (discount
    // applied regardless of bill type) so existing tenants see no change
    // until the owner opts into the tighter setting. Bills of type
    // "miscellaneous" are never discount-eligible either way — that's
    // gated separately by canApplyDiscount not applying to that flow at all.
    discountBillTypeScope: text("discount_bill_type_scope", {
      enum: ["priced_only", "priced_and_unpriced"],
    })
      .notNull()
      .default("priced_and_unpriced"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("users_tenant_username_idx").on(table.tenantId, table.username),
  ],
);

export const productCategories = pgTable(
  "product_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    token: text("token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("product_categories_tenant_token_idx").on(table.tenantId, table.token),
  ],
);

export const productSubCategories = pgTable(
  "product_sub_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => productCategories.id),
    name: text("name").notNull(),
    token: text("token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("product_sub_categories_tenant_token_idx").on(table.tenantId, table.token),
  ],
);

// Units — gives real structure and conversion math to unit strings
export const units = pgTable(
  "units",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    code: text("code").notNull(),
    type: text("type", { enum: ["weight", "volume", "count"] }).notNull(),
    isBase: boolean("is_base").notNull().default(false),
    // Points to the base unit this converts into (null for base units themselves)
    baseUnitId: uuid("base_unit_id"),
    // How many base units = 1 of this unit (e.g. maund=40, gram=0.001)
    conversionFactor: numeric("conversion_factor", { precision: 20, scale: 10 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("units_tenant_code_idx").on(table.tenantId, table.code),
  ],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    subCategoryId: uuid("sub_category_id")
      .notNull()
      .references(() => productSubCategories.id),
    name: text("name").notNull(),
    token: text("token").notNull(),
    // FK to units table — replaces old free-text unit field
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id),
    currentPrice: numeric("current_price", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    imageKey: text("image_key"),
    status: text("status", { enum: ["active", "inactive"] })
      .notNull()
      .default("active"),
    // Charges/Tax module §3 — true = doesn't deduct inventory, no weight/unit
    // entry beyond simple quantity. Lives in the normal 3-tier catalogue
    // (e.g. Category "Services" → Sub-category "Packaging" → "Small Box") and
    // can carry charge_categories exactly like a physical product.
    isServiceItem: boolean("is_service_item").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("products_tenant_token_idx").on(table.tenantId, table.token),
  ],
);

// Which units a product may be sold in (e.g. Live Bird → Kilogram + Maund + Pound).
// products.unitId stays the unit currentPrice is denominated in; this table is the
// broader, owner-configurable set of units a cashier is allowed to sell it in.
export const productUnits = pgTable(
  "product_units",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("product_units_product_unit_idx").on(table.productId, table.unitId),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    receiptNumber: text("receipt_number").notNull(),
    type: text("type", { enum: ["sale", "purchase"] }).notNull().default("sale"),
    status: text("status", { enum: ["completed", "voided", "refunded"] })
      .notNull()
      .default("completed"),
    // Legacy free-choice enum — kept (not yet dropped) so the existing sales/
    // till routes keep working unmodified. paymentMethodId below is the real
    // FK per handover §2; routes migrate to it when checkout is rewired to
    // the charge engine. Both are populated together once that lands.
    paymentMethod: text("payment_method", { enum: ["cash", "card", "wallet"] })
      .notNull()
      .default("cash"),
    paymentMethodId: uuid("payment_method_id").references(() => paymentMethods.id),
    // §7 — miscellaneous added. Structurally excluded from regulatory export
    // queries and uses its own M-prefixed receipt sequence (see §7 note).
    billType: text("bill_type", { enum: ["priced", "unpriced", "miscellaneous"] })
      .notNull()
      .default("priced"),
    subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
    // §4 step 3 — percentage or manual flat discount applied to the
    // subtotal before any charge category calculates. discountAmount is the
    // resolved currency amount (stored regardless of discountType, so the
    // itemized receipt never has to re-derive it from a percentage + a
    // since-changed subtotal).
    discountType: text("discount_type", { enum: ["percentage", "flat"] }),
    discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    // §4 step 6 — full-precision total before rounding. Tax reporting and
    // the rounding summary always read this, never `total`.
    trueTotal: numeric("true_total", { precision: 14, scale: 2 }).notNull().default("0"),
    // §4 step 7/8 — final charged amount after any cashier rounding choice.
    total: numeric("total", { precision: 10, scale: 2 }).notNull().default("0"),
    // §4.1 — total - trueTotal. Zero when rounding wasn't required/applied.
    roundingAdjustment: numeric("rounding_adjustment", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    roundingMethod: text("rounding_method", {
      enum: ["exact", "round_up", "round_down", "custom"],
    }),
    roundingAppliedByUserId: uuid("rounding_applied_by_user_id").references(() => users.id),
    // §9 — flagged, never blocked (e.g. a Return that overdraws a running
    // customer balance). Surfaced for review, not enforced as a hard stop.
    isNegativeBalance: boolean("is_negative_balance").notNull().default(false),
    // §9.1 — when a credit/unpriced bill is actually paid. Distinct from the
    // existing `settled` concept referenced in the handover; see settled
    // boolean note below — this stores WHEN, not just whether.
    settled: boolean("settled").notNull().default(false),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    notes: text("notes"),
    customerName: text("customer_name"),
    customerPhone: text("customer_phone"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: uuid("voided_by").references(() => users.id),
    voidReason: text("void_reason"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("transactions_tenant_receipt_idx").on(table.tenantId, table.receiptNumber),
  ],
);

export const transactionLineItems = pgTable("transaction_line_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  transactionId: uuid("transaction_id")
    .notNull()
    .references(() => transactions.id),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id),
  productName: text("product_name").notNull(),
  unit: text("unit").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull(),
  rate: numeric("rate", { precision: 10, scale: 2 }).notNull(),
  // §3.1 — base price × qty plus modifierTotal below = lineTotal. Kept
  // separate so a line's composition stays inspectable without re-summing
  // transaction_line_modifiers every time a historical bill is viewed.
  modifierTotal: numeric("modifier_total", { precision: 10, scale: 2 }).notNull().default("0"),
  lineTotal: numeric("line_total", { precision: 10, scale: 2 }).notNull(),
  // §3.1 — free text, e.g. "no onions". Never affects price/tax, never
  // printed on the customer receipt, only on the kitchen/fulfillment ticket.
  kitchenNote: text("kitchen_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Draft carts — saved mid-session, no expiry, deleted manually or on resume
export const drafts = pgTable("drafts", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  branchId: uuid("branch_id")
    .notNull()
    .references(() => branches.id),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  draftNumber: integer("draft_number").notNull(),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  // §3.1 — modifiers/kitchenNote are optional additions to the existing
  // jsonb blob rather than a new draft_line_item_modifiers table (as the
  // handover doc suggests). This codebase's drafts are a single jsonb array,
  // not a real draft_line_items table, so a separate modifiers table has
  // nothing to join against yet. Flagged for revisit when drafts.ts is
  // rewired to the modifier engine — restructuring drafts into real rows is
  // a bigger, separate migration and is out of scope for this pass.
  items: jsonb("items")
    .notNull()
    .$type<
      Array<{
        productId: string;
        productName: string;
        quantity: number;
        rate: string;
        unit: string;
        kitchenNote?: string;
        modifiers?: Array<{
          modifierGroupId: string;
          modifierOptionId: string;
          label: string;
          quantity: number;
          unitCharge: string;
          totalCharge: string;
        }>;
      }>
    >(),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Till module (see handover-till-module.md) ────────────────────────────

// The actual notes/coins a shop's currency uses. Set once per tenant during
// onboarding (Super Admin) — never hardcoded to PKR, and never hard-deleted:
// a discontinued note is turned inactive so historical counts still resolve.
export const currencyDenominations = pgTable(
  "currency_denominations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    value: numeric("value", { precision: 10, scale: 2 }).notNull(),
    type: text("type", { enum: ["note", "coin"] }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("currency_denominations_tenant_value_type_idx").on(
      table.tenantId,
      table.value,
      table.type,
    ),
  ],
);

// One cashier's shift, start to end. Expected closing cash is recomputed from
// real sales/refunds at close time; variance is expected vs. what was
// actually counted. Once a session is folded into a handover, handoverId is
// set and it can no longer be edited or re-handed-over.
export const tillSessions = pgTable(
  "till_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    status: text("status", { enum: ["open", "closed"] })
      .notNull()
      .default("open"),
    openingCash: numeric("opening_cash", { precision: 10, scale: 2 }).notNull(),
    expectedClosingCash: numeric("expected_closing_cash", { precision: 10, scale: 2 }),
    actualClosingCash: numeric("actual_closing_cash", { precision: 10, scale: 2 }),
    variance: numeric("variance", { precision: 10, scale: 2 }),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    handoverId: uuid("handover_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // A cashier can only have one open till session at a time.
    uniqueIndex("till_sessions_one_open_per_user_idx")
      .on(table.userId)
      .where(sql`${table.status} = 'open'`),
  ],
);

// Itemized "N × denomination" breakdown for cashiers who are required to
// count. Captured at both opening and closing so a mismatch is traceable to
// a specific note/coin, not just a vague total.
export const tillDenominationCounts = pgTable(
  "till_denomination_counts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    tillSessionId: uuid("till_session_id")
      .notNull()
      .references(() => tillSessions.id),
    denominationId: uuid("denomination_id")
      .notNull()
      .references(() => currencyDenominations.id),
    countType: text("count_type", { enum: ["opening", "closing"] }).notNull(),
    quantity: integer("quantity").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("till_denomination_counts_session_denom_type_idx").on(
      table.tillSessionId,
      table.denominationId,
      table.countType,
    ),
  ],
);



// cash from one or more closed till sessions and recounts the combined
// total. Catches a second, separate kind of mismatch — cash lost or gained
// in the handover itself, not in any one cashier's shift.
export const tillHandovers = pgTable("till_handovers", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  branchId: uuid("branch_id")
    .notNull()
    .references(() => branches.id),
  receivedBy: uuid("received_by")
    .notNull()
    .references(() => users.id),
  totalExpected: numeric("total_expected", { precision: 10, scale: 2 }).notNull(),
  totalReceived: numeric("total_received", { precision: 10, scale: 2 }).notNull(),
  variance: numeric("variance", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Charges & Tax Configuration module (see charges-tax-module-dev-handover.md) ───

// §2 — Payment methods as a real table, not an enum. requiresRounding drives
// whether the §4.1 interactive rounding flow appears at checkout at all.
export const paymentMethods = pgTable(
  "payment_methods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    requiresRounding: boolean("requires_rounding").notNull().default(false),
    // Charges/Tax module — which of the three rounding rules applies
    // whenever this payment method requires rounding. Owner-decided at
    // setup time; the cashier no longer picks this per-sale at checkout.
    roundingMethod: text("rounding_method", { enum: ["exact", "round_up", "round_down"] })
      .notNull()
      .default("exact"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("payment_methods_tenant_name_idx").on(table.tenantId, table.name),
  ],
);

// §1 + §6 — owner-defined Charge Category (tax, surcharge, or any other fee),
// append-only versioned. Each row is one version. `versionGroupId` is a
// stable identifier shared by every version of "the same" category, used for
// audit/history views (e.g. "show me every rate GST has ever had"); it is
// NOT what other tables reference.
//
// Design note (not explicit in the handover doc, decided here for a working
// implementation): chargeRateLines.chargeCategoryId, dependsOnChargeCategoryId,
// and product_charge_category_assignment.chargeCategoryId all point at the
// CURRENT version's row id — never at versionGroupId directly. When a new
// version is created (§6), creation logic must, in one transaction:
//   1. insert the new version row (new id, same versionGroupId, isCurrent=true)
//   2. flip the previous version's isCurrent to false
//   3. copy its rate lines forward onto the new chargeCategoryId
//   4. re-point any assignments/dependents that referenced the old id
// This keeps every FK a real, enforced foreign key while still satisfying
// §6: a historical transaction_charge_lines row keeps the OLD chargeCategoryId
// forever (that row is never deleted, just isCurrent=false / isActive=false),
// so old bills still resolve against the exact version they used.
export const chargeCategories = pgTable(
  "charge_categories",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    // Branch-level tax is mandatory in practice — null is only meaningful as
    // a tenant-level default, per §1.
    branchId: uuid("branch_id").references(() => branches.id),
    versionGroupId: uuid("version_group_id").notNull(),
    name: text("name").notNull(),
    nameSecondaryLanguage: text("name_secondary_language"),
    categoryType: text("category_type", { enum: ["tax", "surcharge", "other"] }).notNull(),
    isRegulatoryReportable: boolean("is_regulatory_reportable").notNull().default(false),
    regulatoryAuthorityName: text("regulatory_authority_name"),
    // Structurally forced false for categoryType = 'tax' via the check
    // constraint below — never just app-level validated (§5).
    countsTowardOtherBases: boolean("counts_toward_other_bases").notNull().default(false),
    refundableOnReturn: boolean("refundable_on_return").notNull().default(true),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    isCurrent: boolean("is_current").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("charge_categories_tenant_branch_idx").on(table.tenantId, table.branchId),
    index("charge_categories_version_group_idx").on(table.versionGroupId),
    // Only one current version per version-group at a time.
    uniqueIndex("charge_categories_one_current_per_group_idx")
      .on(table.versionGroupId)
      .where(sql`${table.isCurrent} = true`),
    check(
      "charge_categories_tax_cannot_count_toward_other_bases",
      sql`NOT (${table.categoryType} = 'tax' AND ${table.countsTowardOtherBases} = true)`,
    ),
  ],
);

// §1 — one Charge Category can have multiple rate lines; this is what makes
// payment-method-conditional rates (e.g. cash-vs-card GST) work.
export const chargeRateLines = pgTable(
  "charge_rate_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    chargeCategoryId: uuid("charge_category_id")
      .notNull()
      .references(() => chargeCategories.id),
    calculationType: text("calculation_type", { enum: ["fixed", "percentage"] }).notNull(),
    value: numeric("value", { precision: 14, scale: 4 }).notNull(),
    scope: text("scope", { enum: ["per_product", "whole_bill"] }).notNull(),
    conditionType: text("condition_type", {
      enum: ["payment_method", "manual_selection"],
    }).notNull(),
    conditionPaymentMethodId: uuid("condition_payment_method_id").references(
      () => paymentMethods.id,
    ),
    manualSelectionLabel: text("manual_selection_label"),
    // §5 — if set, this rate line's base includes another category's
    // calculated amount. Points at a chargeCategories.id (current version).
    // Cannot point at a tax-type category (enforced app-side at save time,
    // see validateNoCycle in services/api/src/lib/charge-engine.ts).
    dependsOnChargeCategoryId: uuid("depends_on_charge_category_id").references(
      (): typeof chargeCategories.id => chargeCategories.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("charge_rate_lines_category_idx").on(table.chargeCategoryId),
    check(
      "charge_rate_lines_condition_payment_method_required",
      sql`(${table.conditionType} <> 'payment_method' OR ${table.conditionPaymentMethodId} IS NOT NULL)`,
    ),
    check(
      "charge_rate_lines_manual_selection_label_required",
      sql`(${table.conditionType} <> 'manual_selection' OR ${table.manualSelectionLabel} IS NOT NULL)`,
    ),
  ],
);

// §1 — 4-level inheritance: Branch → Product Category → Product Sub-category
// → Product. `targetId` is polymorphic (points at branches.id,
// product_categories.id, product_sub_categories.id, or products.id
// depending on assignmentLevel) so it deliberately has no FK constraint.
//
// `override_rate` (added after §1's original on/off-only design) lets an
// owner keep a Charge Category switched on everywhere but give one level
// (e.g. a single product like "Leg Piece") its own calculation type + value
// instead of the category's normal rate line — same tax, different number,
// without needing a second category. rateOverrideCalculationType/Value are
// only ever set together, only for this overrideType, enforced by the check
// constraint below (and re-checked app-side in charge-assignments.ts).
export const productChargeCategoryAssignment = pgTable(
  "product_charge_category_assignment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    chargeCategoryId: uuid("charge_category_id")
      .notNull()
      .references(() => chargeCategories.id),
    assignmentLevel: text("assignment_level", {
      enum: ["branch", "product_category", "product_sub_category", "product"],
    }).notNull(),
    targetId: uuid("target_id").notNull(),
    overrideType: text("override_type", {
      enum: ["inherit", "override_on", "override_off", "override_rate"],
    })
      .notNull()
      .default("inherit"),
    // Only set (both together) when overrideType = 'override_rate'.
    rateOverrideCalculationType: text("rate_override_calculation_type", {
      enum: ["fixed", "percentage"],
    }),
    rateOverrideValue: numeric("rate_override_value", { precision: 14, scale: 4 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("product_charge_category_assignment_unique_idx").on(
      table.chargeCategoryId,
      table.assignmentLevel,
      table.targetId,
    ),
    index("product_charge_category_assignment_target_idx").on(
      table.assignmentLevel,
      table.targetId,
    ),
    check(
      "product_charge_category_assignment_rate_override_shape",
      sql`(
        (${table.overrideType} = 'override_rate'
          AND ${table.rateOverrideCalculationType} IS NOT NULL
          AND ${table.rateOverrideValue} IS NOT NULL)
        OR
        (${table.overrideType} <> 'override_rate'
          AND ${table.rateOverrideCalculationType} IS NULL
          AND ${table.rateOverrideValue} IS NULL)
      )`,
    ),
  ],
);

// ─── Modifier Groups — product customization (§3.1) ────────────────────────

// Built once, attached many times — same library pattern already used for
// Units and Charge Categories. linkedToSubCategoryId turns this into a
// "Linked Group" (e.g. Packaging) whose options are pulled live from a real
// product sub-category instead of being manually typed.
export const modifierGroups = pgTable("modifier_groups", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: text("name").notNull(),
  selectionType: text("selection_type", { enum: ["single", "multi"] }).notNull(),
  isRequired: boolean("is_required").notNull().default(false),
  isPriced: boolean("is_priced").notNull().default(false),
  linkedToSubCategoryId: uuid("linked_to_sub_category_id").references(
    () => productSubCategories.id,
  ),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// modifier_charge = max(0, selectedQty - includedFreeQuantity) x pricePerAdditionalUnit
// covers all three behaviors: flat priced (includedFreeQuantity=0, maxQuantity=1),
// priced-with-free-allowance (includedFreeQuantity=1), purely descriptive
// (pricePerAdditionalUnit=0). linkedProductId turns this into a Linked
// Option pulling its live price from a real product (e.g. "Small Box").
export const modifierOptions = pgTable("modifier_options", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  modifierGroupId: uuid("modifier_group_id")
    .notNull()
    .references(() => modifierGroups.id),
  label: text("label").notNull(),
  includedFreeQuantity: integer("included_free_quantity").notNull().default(0),
  pricePerAdditionalUnit: numeric("price_per_additional_unit", { precision: 10, scale: 2 })
    .notNull()
    .default("0"),
  maxQuantity: integer("max_quantity"),
  linkedProductId: uuid("linked_product_id").references(() => products.id),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Attaches a modifier group (library item) to a specific product.
// isRequiredOverride lets one product override the group's shared
// required/optional default without affecting other products using it.
export const productModifierGroups = pgTable(
  "product_modifier_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    modifierGroupId: uuid("modifier_group_id")
      .notNull()
      .references(() => modifierGroups.id),
    isRequiredOverride: boolean("is_required_override"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("product_modifier_groups_product_group_idx").on(
      table.productId,
      table.modifierGroupId,
    ),
  ],
);

// Modifier selections actually made on a confirmed transaction line.
// Everything is snapshotted (label/unitCharge) so historical receipts and
// kitchen tickets never drift if the modifier option is edited later.
export const transactionLineModifiers = pgTable("transaction_line_modifiers", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  transactionLineItemId: uuid("transaction_line_item_id")
    .notNull()
    .references(() => transactionLineItems.id),
  modifierGroupId: uuid("modifier_group_id")
    .notNull()
    .references(() => modifierGroups.id),
  modifierOptionId: uuid("modifier_option_id")
    .notNull()
    .references(() => modifierOptions.id),
  optionLabel: text("option_label").notNull(),
  quantity: integer("quantity").notNull(),
  unitCharge: numeric("unit_charge", { precision: 10, scale: 2 }).notNull(),
  totalCharge: numeric("total_charge", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Bill Types — Quotations (§7) ───────────────────────────────────────────

// Deliberately NOT part of `transactions` — a Quotation is a non-binding
// estimate with zero accounting weight until it converts.
export const quotations = pgTable("quotations", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  branchId: uuid("branch_id")
    .notNull()
    .references(() => branches.id),
  createdByUserId: uuid("created_by_user_id")
    .notNull()
    .references(() => users.id),
  customerName: text("customer_name"),
  calculatedTotal: numeric("calculated_total", { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  // Set on conversion; the resulting transaction gets a fresh receipt number
  // and a full recalculation — this record is preserved only as a
  // quoted-on-vs-purchased-on reference log, never the source of truth.
  convertedToTransactionId: uuid("converted_to_transaction_id").references(() => transactions.id),
});

// Mirrors transaction_line_items but stores no charge calculations — those
// are estimated at display time only, never persisted as final figures.
export const quotationLineItems = pgTable("quotation_line_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  quotationId: uuid("quotation_id")
    .notNull()
    .references(() => quotations.id),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id),
  productName: text("product_name").notNull(),
  unit: text("unit").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull(),
  rate: numeric("rate", { precision: 10, scale: 2 }).notNull(),
  lineTotal: numeric("line_total", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Transaction Charge Lines (§9) ──────────────────────────────────────────

// Each individually calculated charge amount per transaction — one row per
// (category, rate line used) per bill, or per line item when scope is
// per_product. This is what makes itemized receipts and separated tax/
// surcharge reporting possible without recalculating from scratch every
// time a historical bill is viewed (§6). Everything here is a snapshot: it
// intentionally duplicates category/rate-line fields so this row never
// changes meaning even if the category is edited or re-versioned later.
export const transactionChargeLines = pgTable(
  "transaction_charge_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id),
    // Null when scope = whole_bill; set when scope = per_product.
    transactionLineItemId: uuid("transaction_line_item_id").references(
      () => transactionLineItems.id,
    ),
    chargeCategoryId: uuid("charge_category_id")
      .notNull()
      .references(() => chargeCategories.id),
    chargeRateLineId: uuid("charge_rate_line_id")
      .notNull()
      .references(() => chargeRateLines.id),
    categoryName: text("category_name").notNull(),
    categoryType: text("category_type", { enum: ["tax", "surcharge", "other"] }).notNull(),
    calculationType: text("calculation_type", { enum: ["fixed", "percentage"] }).notNull(),
    rateValue: numeric("rate_value", { precision: 14, scale: 4 }).notNull(),
    // The base amount this charge was calculated against (discounted
    // subtotal ± any dependency amounts it was configured to include).
    baseAmount: numeric("base_amount", { precision: 14, scale: 2 }).notNull(),
    calculatedAmount: numeric("calculated_amount", { precision: 14, scale: 2 }).notNull(),
    // Whether this charge's amount was itself folded into another
    // category's base at calc time (i.e. countsTowardOtherBases applied).
    includedInOtherCategoryBase: boolean("included_in_other_category_base")
      .notNull()
      .default(false),
    // Returns processing — proportion of this charge actually refunded so
    // far (0 for an untouched line, partial/full on a Return, always equal
    // to calculatedAmount on a Void).
    refundedAmount: numeric("refunded_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("transaction_charge_lines_transaction_idx").on(table.transactionId),
    index("transaction_charge_lines_line_item_idx").on(table.transactionLineItemId),
  ],
);

// Discount module — which products a cashier's discount is allowed to touch
// when users.discountRestrictedToProducts = true for that cashier. Ignored
// entirely when that flag is false (discount then applies bill-wide).
// Mirrors the productUnits many-to-many pattern above rather than the
// polymorphic charge-assignment table. A cashier can additionally (or
// instead) be restricted by whole category — see cashierDiscountCategories
// just below — the two restrictions are independent and unioned together.
export const cashierDiscountProducts = pgTable(
  "cashier_discount_products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("cashier_discount_products_user_product_idx").on(table.userId, table.productId),
  ],
);

// Discount module — which product CATEGORIES a cashier's discount is
// allowed to touch when users.discountRestrictedToCategories = true for
// that cashier. Ignored entirely when that flag is false. Sibling table to
// cashier_discount_products above; when both restrictions are on for the
// same cashier, a line item is eligible if it matches either one (its exact
// product is listed here OR its category is listed here) — see sales.ts
// §4 step 3.
export const cashierDiscountCategories = pgTable(
  "cashier_discount_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => productCategories.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("cashier_discount_categories_user_category_idx").on(
      table.userId,
      table.categoryId,
    ),
  ],
);

// §9 — reporting visibility across branches, fully separate from a user's
// strict one-branch operational assignment (users.branchId above).
export const userBranchViewAccess = pgTable(
  "user_branch_view_access",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_branch_view_access_user_branch_idx").on(table.userId, table.branchId),
  ],
);

// Receipt Designer — one row per (tenant, branch) scope. branchId = null is
// the tenant-wide default; a non-null branchId is a branch-specific
// override. At most one row should ever exist per scope (enforced in the
// API layer, not a DB constraint, since Postgres unique indexes treat NULL
// as distinct and a plain unique index can't collapse multiple
// branchId=NULL rows to one on its own).
export const receiptTemplates = pgTable(
  "receipt_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    // null = tenant-wide default template, applied to any branch that has
    // no override of its own.
    branchId: uuid("branch_id").references(() => branches.id),
    // Which starter preset this was based on ("minimal" | "classic" |
    // "modern" | "branded" | "custom") — display-only, lets the designer UI
    // show which card is selected.
    presetId: text("preset_id").notNull().default("modern"),
    // Retired: tax-compliance-mode locking was removed from the designer.
    // Column kept (always false) so we don't need a destructive migration.
    taxComplianceMode: boolean("tax_compliance_mode").notNull().default(false),
    // Full block-list config: [{ id, type, visible, ...block-specific
    // fields }]. Kept as jsonb rather than normalized tables since the
    // block shape is still evolving and is always read/written as a whole.
    config: jsonb("config").notNull(),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("receipt_templates_tenant_branch_idx").on(table.tenantId, table.branchId),
  ],
);