import {
  boolean,
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
    // username unique per tenant â€” two different shops can have the same username
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
    // username must be unique within a tenant, not globally
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
    // token unique per tenant
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
    // token unique per tenant
    uniqueIndex("product_sub_categories_tenant_token_idx").on(table.tenantId, table.token),
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
    unit: text("unit").notNull().default("kg"),
    currentPrice: numeric("current_price", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    imageKey: text("image_key"),
    status: text("status", { enum: ["active", "inactive"] })
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // tracks when price was last changed â€” required for price history reporting
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // token unique per tenant
    uniqueIndex("products_tenant_token_idx").on(table.tenantId, table.token),
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
    // receipt number unique per tenant â€” two tenants can have the same receipt number string
    receiptNumber: text("receipt_number").notNull(),
    type: text("type", { enum: ["sale", "purchase"] }).notNull().default("sale"),
    status: text("status", { enum: ["completed", "voided", "refunded"] })
      .notNull()
      .default("completed"),
    paymentMethod: text("payment_method", { enum: ["cash", "card", "wallet"] })
      .notNull()
      .default("cash"),
    subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 10, scale: 2 }).notNull().default("0"),
    notes: text("notes"),
    // void tracking â€” required by requirements doc Section 13.3.5
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: uuid("voided_by").references(() => users.id),
    voidReason: text("void_reason"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // receipt number unique per tenant, not globally
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
  // stored at time of sale â€” never changes even if product is renamed/repriced
  productName: text("product_name").notNull(),
  unit: text("unit").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull(),
  rate: numeric("rate", { precision: 10, scale: 2 }).notNull(),
  lineTotal: numeric("line_total", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
