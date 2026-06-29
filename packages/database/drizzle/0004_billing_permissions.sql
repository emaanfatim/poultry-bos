-- Restore enum types dropped in 0003
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'mobile_wallet', 'card');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('draft', 'completed', 'voided', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('sale', 'purchase');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'cashier');