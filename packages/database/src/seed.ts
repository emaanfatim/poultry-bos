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

async function main() {
  const db = createDb();

  const existing = await db.select().from(tenants).limit(1);
  if (existing.length > 0) {
    console.log("Seed skipped — tenant already exists");
    await closeDb();
    return;
  }

  // ── Tenant & Branch ─────────────────────────────────────────────────────────
  const [tenant] = await db
    .insert(tenants)
    .values({
      name: "Poultry Shop",
      address: "Shop 12, Poultry Market, Karachi",
      phone: "0300-1234567",
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

  // ── Users ───────────────────────────────────────────────────────────────────
  const ownerHash = await bcrypt.hash("owner123", 10);
const cashierHash = await bcrypt.hash("cashier123", 10);
const authCashierHash = await bcrypt.hash("senior123", 10);

await db.insert(users).values([
  {
    tenantId: tenant!.id,
    branchId: branch!.id,
    username: "owner",
    passwordHash: ownerHash,
    displayName: "Shop Owner",
    role: "owner",
    canIssuePricedBill: true,   // owners always have this
  },
  {
    tenantId: tenant!.id,
    branchId: branch!.id,
    username: "cashier",
    passwordHash: cashierHash,
    displayName: "Counter Cashier",
    role: "cashier",
    canIssuePricedBill: false,  // standard cashier — delivery note only
  },
  {
    tenantId: tenant!.id,
    branchId: branch!.id,
    username: "senior",
    passwordHash: authCashierHash,
    displayName: "Senior Cashier",
    role: "cashier",
    canIssuePricedBill: true,   // authorized cashier — can issue priced bills
  },
]);

  // ── Categories ───────────────────────────────────────────────────────────────
  //
  // STRUCTURE:
  //   Category  →  SubCategory  →  Products
  //
  //   "Finished Output Products"
  //     ├── "Fresh Cuts"         → Leg Piece, Boneless, Curry Cut, Whole Bird
  //     └── "Wings"              → Plain Wings, Chicken BBQ Wings, Teriyaki Wings
  //
  //   "Live Birds"
  //     └── "Broiler"            → Broiler (Live), Broiler (Dressed)
  //
  // The PRODUCT is what the cashier sells.
  // The SUB-CATEGORY groups related products (e.g. all wing styles together).
  // The CATEGORY is the top-level section header on the POS screen.

  const [catFinished] = await db
    .insert(productCategories)
    .values({
      tenantId: tenant!.id,
      name: "Finished Output Products",
      token: "CG1",
    })
    .returning();

  const [catLive] = await db
    .insert(productCategories)
    .values({
      tenantId: tenant!.id,
      name: "Live Birds",
      token: "CG2",
    })
    .returning();

  // ── Sub-Categories ───────────────────────────────────────────────────────────

  const [subFreshCuts] = await db
    .insert(productSubCategories)
    .values({
      tenantId: tenant!.id,
      categoryId: catFinished!.id,
      name: "Fresh Cuts",
      token: "SC1",
    })
    .returning();

  const [subWings] = await db
    .insert(productSubCategories)
    .values({
      tenantId: tenant!.id,
      categoryId: catFinished!.id,
      name: "Wings",           // <-- subcategory is "Wings"
      token: "SC2",
    })
    .returning();

  const [subBroiler] = await db
    .insert(productSubCategories)
    .values({
      tenantId: tenant!.id,
      categoryId: catLive!.id,
      name: "Broiler",
      token: "SC3",
    })
    .returning();

  // ── Products ─────────────────────────────────────────────────────────────────

  await db.insert(products).values([
    // Fresh Cuts
    {
      tenantId: tenant!.id,
      subCategoryId: subFreshCuts!.id,
      name: "Leg Piece",
      token: "P1",
      unit: "kg",
      currentPrice: "520.00",
      imageKey: "products/leg-piece.webp",
    },
    {
      tenantId: tenant!.id,
      subCategoryId: subFreshCuts!.id,
      name: "Boneless",
      token: "P2",
      unit: "kg",
      currentPrice: "780.00",
      imageKey: "products/boneless.jpg",
    },
    {
      tenantId: tenant!.id,
      subCategoryId: subFreshCuts!.id,
      name: "Curry Cut",
      token: "P3",
      unit: "kg",
      currentPrice: "480.00",
      imageKey: "products/curry-cut.webp",
    },
    {
      tenantId: tenant!.id,
      subCategoryId: subFreshCuts!.id,
      name: "Whole Bird",
      token: "P4",
      unit: "piece",
      currentPrice: "850.00",
      imageKey: "products/whole-bird.webp",
    },
 
    {
      tenantId: tenant!.id,
      subCategoryId: subWings!.id,
      name: "Plain Wings",
      token: "P5",
      unit: "kg",
      currentPrice: "450.00",
      imageKey: "products/wings.webp",
    },
    {
      tenantId: tenant!.id,
      subCategoryId: subWings!.id,
      name: "Chicken BBQ Wings",
      token: "P6",
      unit: "kg",
      currentPrice: "620.00",
      imageKey: "products/wings.webp",
    },
    {
      tenantId: tenant!.id,
      subCategoryId: subWings!.id,
      name: "Teriyaki Wings",
      token: "P7",
      unit: "kg",
      currentPrice: "680.00",
      imageKey: "products/wings.webp",
    },

    {
      tenantId: tenant!.id,
      subCategoryId: subBroiler!.id,
      name: "Broiler (Live)",
      token: "P8",
      unit: "kg",
      currentPrice: "290.00",
      imageKey: "products/broiler-live.jpg"
    },
    {
      tenantId: tenant!.id,
      subCategoryId: subBroiler!.id,
      name: "Broiler (Dressed)",
      token: "P9",
      unit: "kg",
      currentPrice: "350.00",
      imageKey: "products/broiler-dressed.webp",
    },
  ]);

  console.log("Seed complete");
  console.log("  Owner login:   owner / owner123");
  console.log("  Cashier login: cashier / cashier123");
  console.log("");
  console.log("  Category structure seeded:");
  console.log("  Finished Output Products");
  console.log("    ├── Fresh Cuts  → Leg Piece, Boneless, Curry Cut, Whole Bird");
  console.log("    └── Wings       → Plain Wings, Chicken BBQ Wings, Teriyaki Wings");
  console.log("  Live Birds");
  console.log("    └── Broiler     → Broiler (Live), Broiler (Dressed)");
  await closeDb();
}

main().catch(async (error) => {
  console.error("Seed failed:", error);
  await closeDb();
  process.exit(1);
});
