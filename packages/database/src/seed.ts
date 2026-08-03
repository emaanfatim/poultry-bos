import dotenv from "dotenv";
import path from "node:path";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { closeDb, createDb } from "./index.ts";
import {
  branches,
  chargeCategories,
  chargeRateLines,
  currencyDenominations,
  paymentMethods,
  productCategories,
  productChargeCategoryAssignment,
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
      regulatoryAuthorityName: "FBR",
      regulatoryRegistrationNumber: "STRN-1234567-8",
      roundingIncrement: "1.00",
      roundingThreshold: "0.50",
      customEntryMaxDeviation: "50.00",
      customEntryStepMultiple: "5.00",
    })
    .returning();

  // ── Users ────────────────────────────────────────────────────────────
  const ownerHash = await bcrypt.hash("owner123", 10);
  const cashierHash = await bcrypt.hash("cashier123", 10);
  const backupCashierHash = await bcrypt.hash("senior123", 10);

  const [ownerUser] = await db
    .insert(users)
    .values({
      tenantId: tenant!.id,
      branchId: branch!.id,
      username: "owner",
      passwordHash: ownerHash,
      displayName: "Shop Owner",
      role: "owner",
      canReceiveHandover: true,
      // §4.1/§7 — permission is per-staff-ID, not role-wide, but the owner
      // account is granted both here as the pilot's admin user.
      canApplyCustomRounding: true,
      canCreateMiscellaneousBills: true,
    })
    .returning();

  // "senior" is promoted to Chief Cashier: trusted enough to skip counting
  // their own till, and permitted to receive the end-of-day handover.
  const [seniorUser] = await db
    .insert(users)
    .values({
      tenantId: tenant!.id,
      branchId: branch!.id,
      username: "senior",
      passwordHash: backupCashierHash,
      displayName: "Backup Cashier",
      role: "cashier",
      requiresTillCount: false,
      canReceiveHandover: true,
      // Trusted with Round Down / Custom rounding, per §4.1 — regular
      // cashier below is not, to demonstrate the permission gate.
      canApplyCustomRounding: true,
    })
    .returning();

  // Regular cashier must count every note/coin, and reports to "senior".
  await db.insert(users).values({
    tenantId: tenant!.id,
    branchId: branch!.id,
    username: "cashier",
    passwordHash: cashierHash,
    displayName: "Counter Cashier",
    role: "cashier",
    requiresTillCount: true,
    reportsToId: seniorUser!.id,
  });

  // ── Currency Denominations (Till module — set once per tenant) ────────
  await db.insert(currencyDenominations).values([
    { tenantId: tenant!.id, value: "5000.00", type: "note" },
    { tenantId: tenant!.id, value: "1000.00", type: "note" },
    { tenantId: tenant!.id, value: "500.00", type: "note" },
    { tenantId: tenant!.id, value: "100.00", type: "note" },
    { tenantId: tenant!.id, value: "50.00", type: "note" },
    { tenantId: tenant!.id, value: "20.00", type: "note" },
    { tenantId: tenant!.id, value: "10.00", type: "note" },
    { tenantId: tenant!.id, value: "10.00", type: "coin" },
    { tenantId: tenant!.id, value: "5.00", type: "coin" },
    { tenantId: tenant!.id, value: "2.00", type: "coin" },
    { tenantId: tenant!.id, value: "1.00", type: "coin" },
  ]);

  void ownerUser;

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

  // ── Payment Methods (§2 — real table, not an enum) ──────────────────────
  const [pmCash] = await db
    .insert(paymentMethods)
    .values({ tenantId: tenant!.id, name: "Cash", requiresRounding: true })
    .returning();

  const [pmCard] = await db
    .insert(paymentMethods)
    .values({ tenantId: tenant!.id, name: "Card", requiresRounding: false })
    .returning();

  await db.insert(paymentMethods).values({
    tenantId: tenant!.id,
    name: "Bank Transfer",
    requiresRounding: false,
  });

  // ── Charge Categories (§1/§4/§6) ─────────────────────────────────────────
  // GST — the doc's worked example: a lower cash rate, everything else
  // (card, bank transfer, ...) falls through to the `default` line. Assigned
  // at branch level so it applies to every product unless a more specific
  // level overrides it (§1's 4-level inheritance).
  const gstId = randomUUID();
  const gstVersionGroupId = randomUUID();

  await db.insert(chargeCategories).values({
    id: gstId,
    tenantId: tenant!.id,
    branchId: branch!.id,
    versionGroupId: gstVersionGroupId,
    name: "GST",
    categoryType: "tax",
    isRegulatoryReportable: true,
    regulatoryAuthorityName: "FBR",
    countsTowardOtherBases: false,
    refundableOnReturn: true,
    isCurrent: true,
    isActive: true,
    createdByUserId: ownerUser!.id,
  });

  await db.insert(chargeRateLines).values([
    {
      tenantId: tenant!.id,
      chargeCategoryId: gstId,
      calculationType: "percentage",
      value: "15.0000",
      scope: "whole_bill",
      conditionType: "payment_method",
      conditionPaymentMethodId: pmCash!.id,
    },
    {
      tenantId: tenant!.id,
      chargeCategoryId: gstId,
      calculationType: "percentage",
      value: "17.0000",
      scope: "whole_bill",
      conditionType: "default",
    },
  ]);

  await db.insert(productChargeCategoryAssignment).values({
    tenantId: tenant!.id,
    chargeCategoryId: gstId,
    assignmentLevel: "branch",
    targetId: branch!.id,
    overrideType: "override_on",
  });

  // Packaging — an "other" category, per_product scope, cashier picks a
  // size at checkout via manual_selection (§1). Demonstrates the
  // manual-selection condition type alongside GST's payment-method one.
  const packagingId = randomUUID();
  const packagingVersionGroupId = randomUUID();

  await db.insert(chargeCategories).values({
    id: packagingId,
    tenantId: tenant!.id,
    branchId: branch!.id,
    versionGroupId: packagingVersionGroupId,
    name: "Packaging",
    categoryType: "other",
    isRegulatoryReportable: false,
    countsTowardOtherBases: true,
    refundableOnReturn: false,
    isCurrent: true,
    isActive: true,
    createdByUserId: ownerUser!.id,
  });

  await db.insert(chargeRateLines).values([
    {
      tenantId: tenant!.id,
      chargeCategoryId: packagingId,
      calculationType: "fixed",
      value: "20.0000",
      scope: "per_product",
      conditionType: "manual_selection",
      manualSelectionLabel: "Small Box",
    },
    {
      tenantId: tenant!.id,
      chargeCategoryId: packagingId,
      calculationType: "fixed",
      value: "40.0000",
      scope: "per_product",
      conditionType: "manual_selection",
      manualSelectionLabel: "Large Box",
    },
    {
      tenantId: tenant!.id,
      chargeCategoryId: packagingId,
      calculationType: "fixed",
      value: "0.0000",
      scope: "per_product",
      conditionType: "default",
    },
  ]);

  // Packaging is opt-in per product rather than branch-wide, so it's
  // assigned to "Whole Bird" only (a product customers would ask to be
  // boxed) rather than at branch level like GST above.
  const wholeBird = seededProducts.find((p) => p.token === "P4");
  if (wholeBird) {
    await db.insert(productChargeCategoryAssignment).values({
      tenantId: tenant!.id,
      chargeCategoryId: packagingId,
      assignmentLevel: "product",
      targetId: wholeBird.id,
      overrideType: "override_on",
    });
  }

  console.log("Seed complete");
  console.log("  Owner login:   owner / owner123");
  console.log("  Cashier login: cashier / cashier123 (must count till, reports to senior)");
  console.log("  Senior login:  senior / senior123 (Chief Cashier — skips counting, receives handovers)");
  console.log("  Currency denominations seeded: 5000/1000/500/100/50/20/10 notes, 10/5/2/1 coins");
  console.log("");
  console.log("  Units seeded: kg, g, maund, lb, piece, dozen");
  console.log("  Category structure seeded:");
  console.log("  Finished Output Products");
  console.log("    ├── Fresh Cuts  → Leg Piece, Boneless, Curry Cut, Whole Bird");
  console.log("    └── Wings       → Plain Wings, Chicken BBQ Wings, Teriyaki Wings");
  console.log("  Live Birds");
  console.log("    └── Broiler     → Broiler (Live), Broiler (Dressed)");
  console.log("");
  console.log("  Payment methods seeded: Cash (rounding required), Card, Bank Transfer");
  console.log("  Charge categories seeded:");
  console.log("    GST (tax, branch-wide)   — 15% cash / 17% everything else");
  console.log("    Packaging (other, Whole Bird only) — Small Box Rs20 / Large Box Rs40");
  await closeDb();
}

main().catch(async (error) => {
  console.error("Seed failed:", error);
  await closeDb();
  process.exit(1);
});