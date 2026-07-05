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
