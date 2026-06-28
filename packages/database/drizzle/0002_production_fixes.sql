-- 1. Add updatedAt to tenants
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone NOT NULL DEFAULT now();

-- 2. Add updatedAt to products
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone NOT NULL DEFAULT now();

-- 3. Add notes, voidedAt, voidedBy, voidReason to transactions
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "voided_at" timestamp with time zone;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "voided_by" uuid REFERENCES "users"("id");
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "void_reason" text;

-- 4. Fix username — remove global unique, add per-tenant unique
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_username_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "users_tenant_username_idx" ON "users"("tenant_id", "username");

-- 5. Fix receipt number — remove global unique, add per-tenant unique
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_receipt_number_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "transactions_tenant_receipt_idx" ON "transactions"("tenant_id", "receipt_number");

-- 6. Add token unique per tenant for product_categories
CREATE UNIQUE INDEX IF NOT EXISTS "product_categories_tenant_token_idx" ON "product_categories"("tenant_id", "token");

-- 7. Add token unique per tenant for product_sub_categories
CREATE UNIQUE INDEX IF NOT EXISTS "product_sub_categories_tenant_token_idx" ON "product_sub_categories"("tenant_id", "token");

-- 8. Add token unique per tenant for products
CREATE UNIQUE INDEX IF NOT EXISTS "products_tenant_token_idx" ON "products"("tenant_id", "token");
