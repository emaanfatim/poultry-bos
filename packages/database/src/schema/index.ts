import {
  boolean,
  decimal,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["owner", "cashier"]);
export const productStatusEnum = pgEnum("product_status", ["active", "inactive"]);
export const transactionStatusEnum = pgEnum("transaction_status", [
  "draft",
  "completed",
  "voided",
  "refunded",
]);
export const transactionTypeEnum = pgEnum("transaction_type", ["sale", "purchase"]);
export const paymentMethodEnum = pgEnum("payment_method", [
  "cash",
  "mobile_wallet",
  "card",
]);

export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("PKR"),
  currencySymbol: text("currency_symbol").notNull().default("Rs"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
  (table) => [uniqueIndex("branches_tenant_token_idx").on(table.tenantId, table.token)],
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
    role: userRoleEnum("role").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_tenant_username_idx").on(table.tenantId, table.username)],
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
  (table) => [uniqueIndex("categories_tenant_token_idx").on(table.tenantId, table.token)],
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
    uniqueIndex("sub_categories_tenant_token_idx").on(table.tenantId, table.token),
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
    unit: text("unit").notNull(),
    currentPrice: decimal("current_price", { precision: 12, scale: 2 }).notNull(),
    status: productStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("products_tenant_name_idx").on(table.tenantId, table.name),
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
    receiptNumber: text("receipt_number").notNull(),
    type: transactionTypeEnum("type").notNull(),
    status: transactionStatusEnum("status").notNull().default("completed"),
    paymentMethod: paymentMethodEnum("payment_method").notNull().default("cash"),
    subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull(),
    total: decimal("total", { precision: 12, scale: 2 }).notNull(),
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
  quantity: decimal("quantity", { precision: 12, scale: 3 }).notNull(),
  rate: decimal("rate", { precision: 12, scale: 2 }).notNull(),
  lineTotal: decimal("line_total", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
