import dotenv from "dotenv";
import path from "node:path";


import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { closeDb, createDb } from "./index.js";
import {
  branches,
  productCategories,
  products,
  productSubCategories,
  tenants,
  users,
} from "./schema/index.js";
const result = dotenv.config({
    path: path.resolve(process.cwd(), "../../.env"),
  });

console.log(result);
console.log("cwd =", process.cwd());
console.log("env path =", path.resolve(process.cwd(), ".env"));
console.log("DATABASE_URL =", process.env.DATABASE_URL);

console.log("DATABASE_URL =", process.env.DATABASE_URL);
async function main() {
  const db = createDb();

  const existing = await db.select().from(tenants).limit(1);
  if (existing.length > 0) {
    console.log("Seed skipped — tenant already exists");
    await closeDb();
    return;
  }

  const [tenant] = await db
    .insert(tenants)
    .values({
      name: "Poultry Shop",
      currency: "PKR",
      currencySymbol: "Rs",
    })
    .returning();

  const [branch] = await db
    .insert(branches)
    .values({
      tenantId: tenant!.id,
      name: "Main Counter",
      token: "B1",
    })
    .returning();

  const ownerHash = await bcrypt.hash("owner123", 10);
  const cashierHash = await bcrypt.hash("cashier123", 10);

  await db.insert(users).values([
    {
      tenantId: tenant!.id,
      branchId: branch!.id,
      username: "owner",
      passwordHash: ownerHash,
      displayName: "Shop Owner",
      role: "owner",
    },
    {
      tenantId: tenant!.id,
      branchId: branch!.id,
      username: "cashier",
      passwordHash: cashierHash,
      displayName: "Counter Cashier",
      role: "cashier",
    },
  ]);

  const [category] = await db
    .insert(productCategories)
    .values({
      tenantId: tenant!.id,
      name: "Finished Output Products",
      token: "CG1",
    })
    .returning();

  const [subCategory] = await db
    .insert(productSubCategories)
    .values({
      tenantId: tenant!.id,
      categoryId: category!.id,
      name: "Fresh Cuts",
      token: "SC1",
    })
    .returning();

    await db.insert(products).values([
      {
        tenantId: tenant!.id,
        subCategoryId: subCategory!.id,
        name: "Leg Piece",
        token: "P1",
        unit: "kg",
        currentPrice: "520.00",
        imageKey: "products/leg-piece.webp",
      },
      {
        tenantId: tenant!.id,
        subCategoryId: subCategory!.id,
        name: "Boneless",
        token: "P2",
        unit: "kg",
        currentPrice: "780.00",
        imageKey: "products/boneless.jpg",
      },
      {
        tenantId: tenant!.id,
        subCategoryId: subCategory!.id,
        name: "Curry Cut",
        token: "P3",
        unit: "kg",
        currentPrice: "480.00",
        imageKey: "products/curry-cut.webp",
      },
      {
        tenantId: tenant!.id,
        subCategoryId: subCategory!.id,
        name: "Whole Bird",
        token: "P4",
        unit: "piece",
        currentPrice: "850.00",
        imageKey: "products/whole-bird.webp",
      },
      {
        tenantId: tenant!.id,
        subCategoryId: subCategory!.id,
        name: "Wings",
        token: "P5",
        unit: "kg",
        currentPrice: "450.00",
        imageKey: "products/wings.webp",
      },
    ]);

  console.log("Seed complete");
  console.log("  Owner login:   owner / owner123");
  console.log("  Cashier login: cashier / cashier123");
  await closeDb();
}

main().catch(async (error) => {
  console.error("Seed failed:", error);
  await closeDb();
  process.exit(1);
});
