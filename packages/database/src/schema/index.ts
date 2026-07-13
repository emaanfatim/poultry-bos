import { sql } from "drizzle-orm";
import {
  boolean,
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
    // Whether this staff member is allowed to receive/confirm an end-of-day
    // handover from other cashiers (i.e. can act as a "Chief Cashier").
    canReceiveHandover: boolean("can_receive_handover").notNull().default(false),
    // Reporting line: which staff member this cashier's cash rolls up to at
    // handover time. Nullable — not everyone needs a supervisor set.
    reportsToId: uuid("reports_to_id"),
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
    paymentMethod: text("payment_method", { enum: ["cash", "card", "wallet"] })
      .notNull()
      .default("cash"),
    billType: text("bill_type", { enum: ["priced", "unpriced"] })
      .notNull()
      .default("priced"),
    subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 10, scale: 2 }).notNull().default("0"),
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
  lineTotal: numeric("line_total", { precision: 10, scale: 2 }).notNull(),
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
  items: jsonb("items")
    .notNull()
    .$type<
      Array<{
        productId: string;
        productName: string;
        quantity: number;
        rate: string;
        unit: string;
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

// End-of-day consolidation: owner (or a permitted "Chief Cashier") collects
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