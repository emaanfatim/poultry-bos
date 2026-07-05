import dotenv from "dotenv";
import path from "node:path";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { closeDb, createDb } from "./index.ts";
import {
  branches,
  productCategories,
  productSubCategories,
  productUnits,
  products,
  tenants,
  units,
  users,
} from "./schema/index.ts";

const result = dotenv.config({
  path: path.resolve(process.cwd(), "../../.env"),
});

console.log(result);
console.log("cwd =", process.cwd());
console.log("DATABASE_URL =", process.env.DATABASE_URL);

async function main() {
  const db = createDb();

  const existing = await db.select().from(tenants).limit(1);
  if (existing.length > 0) {
    console.log("Seed skipped — tenant already exists");
    await closeDb();
    return;
  }

  // ── Tenant & Branch ────────────────────────────────────────────────
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

  // ── Users ────────────────────────────────────────────────────────────
  const ownerHash = await bcrypt.hash("owner123", 10);
  const cashierHash = await bcrypt.hash("cashier123", 10);
  const backupCashierHash = await bcrypt.hash("senior123", 10);

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
    {
      tenantId: tenant!.id,
      branchId: branch!.id,
      username: "senior",
      passwordHash: backupCashierHash,
      displayName: "Backup Cashier",
      role: "cashier",
    },
  ]);

  // ── Units ─────────────────────────────────────────────────────────────
  // Base units first (no baseUnitId / conversionFactor)
  const [unitKg] = await db
    .insert(units)
    .values({
      tenantId: tenant!.id,
      name: "Kilogram",
      code: "kg",
      type: "weight",
      isBase: true,
      isActive: true,
    })
    .returning();

  const [unitPiece] = await db
    .insert(units)
    .values({
      tenantId: tenant!.id,
      name: "Piece",
      code: "piece",
      type: "count",
      isBase: true,
      isActive: true,
    })
    .returning();

  // Derived units — convert into base units
  await db.insert(units).values([
    {
      tenantId: tenant!.id,
      name: "Gram",
      code: "g",
      type: "weight",
      isBase: false,
      baseUnitId: unitKg!.id,
      conversionFactor: "0.001",
      isActive: true,
    },
    {
      tenantId: tenant!.id,
      name: "Maund",
      code: "maund",
      type: "weight",
      isBase: false,
      baseUnitId: unitKg!.id,
      conversionFactor: "40",
      isActive: true,
    },
    {
      tenantId: tenant!.id,
      name: "Pound",
      code: "lb",
      type: "weight",
      isBase: false,
      baseUnitId: unitKg!.id,
      conversionFactor: "0.45359237",
      isActive: true,
    },
    {
      tenantId: tenant!.id,
      name: "Dozen",
      code: "dozen",
      type: "count",
      isBase: false,
      baseUnitId: unitPiece!.id,
      conversionFactor: "12",
      isActive: true,
    },
  ]);

  // ── Categories ────────────────────────────────────────────────────────
  const [catFinished] = await db
    .insert(productCategories)
    .values({ tenantId: tenant!.id, name: "Finished Output Products", token: "CG1" })
    .returning();

  const [catLive] = await db
    .insert(productCategories)
    .values({ tenantId: tenant!.id, name: "Live Birds", token: "CG2" })
    .returning();

  // ── Sub-Categories ────────────────────────────────────────────────────
  const [subFreshCuts] = await db
    .insert(productSubCategories)
    .values({ tenantId: tenant!.id, categoryId: catFinished!.id, name: "Fresh Cuts", token: "SC1" })
    .returning();

  const [subWings] = await db
    .insert(productSubCategories)
    .values({ tenantId: tenant!.id, categoryId: catFinished!.id, name: "Wings", token: "SC2" })
    .returning();

  const [subBroiler] = await db
    .insert(productSubCategories)
    .values({ tenantId: tenant!.id, categoryId: catLive!.id, name: "Broiler", token: "SC3" })
    .returning();

  // ── Products (now using unitId FK) ─────────────────────────────────────
  const seededProducts = await db
    .insert(products)
    .values([
    // Fresh Cuts — kg
    {
      tenantId: tenant!.id,
      subCategoryId: subFreshCuts!.id,
      name: "Leg Piece",
      token: "P1",
      unitId: unitKg!.id,
      currentPrice: "520.00",
      imageKey: "products/leg-piece.webp",
    },
    {
      tenantId: tenant!.id,
      subCategoryId: subFreshCuts!.id,
      name: "Boneless",
      token: "P2",
      unitId: unitKg!.id,
      currentPrice: "780.00",
      imageKey: "products/boneless.jpg",
    },
    {
      tenantId: tenant!.id,
      subCategoryId: subFreshCuts!.id,
      name: "Curry Cut",
      token: "P3",
      unitId: unitKg!.id,
      currentPrice: "480.00",
      imageKey: "products/curry-cut.webp",
    },
    {
      tenantId: tenant!.id,
      subCategoryId: subFreshCuts!.id,
      name: "Whole Bird",
      token: "P4",
      unitId: unitPiece!.id,
      currentPrice: "850.00",
      imageKey: "products/whole-bird.webp",
    },
    // Wings — kg
    {
      tenantId: tenant!.id,
      subCategoryId: subWings!.id,
      name: "Plain Wings",
      token: "P5",
      unitId: unitKg!.id,
      currentPrice: "450.00",
      imageKey: "products/wings.webp",
    },
    {
      tenantId: tenant!.id,
      subCategoryId: subWings!.id,
      name: "Chicken BBQ Wings",
      token: "P6",
      unitId: unitKg!.id,
      currentPrice: "620.00",
      imageKey: "products/wings.webp",
    },
    {
      tenantId: tenant!.id,
      subCategoryId: subWings!.id,
      name: "Teriyaki Wings",
      token: "P7",
      unitId: unitKg!.id,
      currentPrice: "680.00",
      imageKey: "products/wings.webp",
    },
    // Broiler — kg
    {
      tenantId: tenant!.id,
      subCategoryId: subBroiler!.id,
      name: "Broiler (Live)",
      token: "P8",
      unitId: unitKg!.id,
      currentPrice: "290.00",
      imageKey: "products/broiler-live.jpg",
    },
    {
      tenantId: tenant!.id,
      subCategoryId: subBroiler!.id,
      name: "Broiler (Dressed)",
      token: "P9",
      unitId: unitKg!.id,
      currentPrice: "350.00",
      imageKey: "products/broiler-dressed.webp",
    },
  ])
    .returning();

  // ── Product ↔ Unit links ────────────────────────────────────────────────
  // Every product can be sold in its own priced unit plus every other active
  // unit of the same type (kg/g/maund/lb for weight, piece/dozen for count).
  const allUnits = [unitKg!, unitPiece!, ...(await db.select().from(units).where(eq(units.tenantId, tenant!.id)))];
  const seenUnitIds = new Set<string>();
  const uniqueUnits = allUnits.filter((u) => {
    if (seenUnitIds.has(u.id)) return false;
    seenUnitIds.add(u.id);
    return true;
  });

  for (const product of seededProducts) {
    const priceUnit = uniqueUnits.find((u) => u.id === product.unitId);
    if (!priceUnit) continue;
    const sellable = uniqueUnits.filter((u) => u.type === priceUnit.type && u.isActive);

    await db.insert(productUnits).values(
      sellable.map((u) => ({
        tenantId: tenant!.id,
        productId: product.id,
        unitId: u.id,
      })),
    );
  }

  console.log("Seed complete");
  console.log("  Owner login:   owner / owner123");
  console.log("  Cashier login: cashier / cashier123");
  console.log("");
  console.log("  Units seeded: kg, g, maund, lb, piece, dozen");
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
