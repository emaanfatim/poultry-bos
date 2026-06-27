ALTER TABLE "products" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "image_key" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "display_order" numeric(6, 0) DEFAULT '0' NOT NULL;