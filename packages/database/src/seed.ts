import dotenv from "dotenv";
import path from "node:path";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
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

  // Second branch under the same tenant — exists purely so the Owner
  // Portal's branch switcher (Header.tsx) has something to show. It only
  // renders the dropdown when there's more than one branch, so a
  // single-branch seed leaves it permanently hidden.
  const [branch2] = await db
    .insert(branches)
    .values({
      tenantId: tenant!.id,
      name: "Downtown Branch",
      token: "B2",
      regulatoryAuthorityName: "FBR",
      regulatoryRegistrationNumber: "STRN-7654321-0",
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

  // One cashier at the second branch, so the owner has someone to see
  // when switching to Downtown Branch in the staff list.
  const downtownCashierHash = await bcrypt.hash("downtown123", 10);
  await db.insert(users).values({
    tenantId: tenant!.id,
    branchId: branch2!.id,
    username: "downtown_cashier",
    passwordHash: downtownCashierHash,
    displayName: "Downtown Cashier",
    role: "cashier",
    requiresTillCount: true,
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

  // ── Product catalog — seeded per-branch (units/categories/products all
  // carry branchId now), so each branch can genuinely stock/price its own
  // things instead of sharing one tenant-wide catalog. ────────────────────
  interface UnitSpec {
    name: string;
    code: string;
    type: "weight" | "volume" | "count";
    isBase: boolean;
    baseCode?: string;
    conversionFactor?: string;
  }
  interface ProductSpec {
    subCategoryToken: string;
    name: string;
    token: string;
    unitCode: string;
    currentPrice: string;
    imageKey?: string;
  }
  interface CategorySpec {
    name: string;
    token: string;
    subCategories: { name: string; token: string }[];
  }

  async function seedCatalogForBranch(
    branchId: string,
    unitSpecs: UnitSpec[],
    categorySpecs: CategorySpec[],
    productSpecs: ProductSpec[],
  ) {
    // Units — base units first, so derived units can reference their id.
    const unitByCode = new Map<string, (typeof units.$inferSelect)>();
    for (const spec of unitSpecs.filter((u) => u.isBase)) {
      const [row] = await db
        .insert(units)
        .values({
          tenantId: tenant!.id,
          branchId,
          name: spec.name,
          code: spec.code,
          type: spec.type,
          isBase: true,
          isActive: true,
        })
        .returning();
      unitByCode.set(spec.code, row!);
    }
    for (const spec of unitSpecs.filter((u) => !u.isBase)) {
      const [row] = await db
        .insert(units)
        .values({
          tenantId: tenant!.id,
          branchId,
          name: spec.name,
          code: spec.code,
          type: spec.type,
          isBase: false,
          baseUnitId: unitByCode.get(spec.baseCode!)!.id,
          conversionFactor: spec.conversionFactor,
          isActive: true,
        })
        .returning();
      unitByCode.set(spec.code, row!);
    }

    // Categories + sub-categories
    const subCategoryByToken = new Map<string, { id: string }>();
    for (const cat of categorySpecs) {
      const [catRow] = await db
        .insert(productCategories)
        .values({ tenantId: tenant!.id, branchId, name: cat.name, token: cat.token })
        .returning();
      for (const sub of cat.subCategories) {
        const [subRow] = await db
          .insert(productSubCategories)
          .values({ tenantId: tenant!.id, branchId, categoryId: catRow!.id, name: sub.name, token: sub.token })
          .returning();
        subCategoryByToken.set(sub.token, subRow!);
      }
    }

    // Products
    const seededProducts = await db
      .insert(products)
      .values(
        productSpecs.map((p) => ({
          tenantId: tenant!.id,
          branchId,
          subCategoryId: subCategoryByToken.get(p.subCategoryToken)!.id,
          name: p.name,
          token: p.token,
          unitId: unitByCode.get(p.unitCode)!.id,
          currentPrice: p.currentPrice,
          imageKey: p.imageKey,
        })),
      )
      .returning();

    // Product ↔ Unit links — every product can be sold in its own priced
    // unit plus every other active unit of the same type in this branch.
    const allUnits = Array.from(unitByCode.values());
    for (const product of seededProducts) {
      const priceUnit = allUnits.find((u) => u.id === product.unitId);
      if (!priceUnit) continue;
      const sellable = allUnits.filter((u) => u.type === priceUnit.type && u.isActive);
      await db.insert(productUnits).values(
        sellable.map((u) => ({ tenantId: tenant!.id, productId: product.id, unitId: u.id })),
      );
    }

    return { units: unitByCode, products: seededProducts };
  }

  // Main Counter — the full original demo catalog.
  await seedCatalogForBranch(
    branch!.id,
    [
      { name: "Kilogram", code: "kg", type: "weight", isBase: true },
      { name: "Piece", code: "piece", type: "count", isBase: true },
      { name: "Gram", code: "g", type: "weight", isBase: false, baseCode: "kg", conversionFactor: "0.001" },
      { name: "Maund", code: "maund", type: "weight", isBase: false, baseCode: "kg", conversionFactor: "40" },
      { name: "Pound", code: "lb", type: "weight", isBase: false, baseCode: "kg", conversionFactor: "0.45359237" },
      { name: "Dozen", code: "dozen", type: "count", isBase: false, baseCode: "piece", conversionFactor: "12" },
    ],
    [
      {
        name: "Finished Output Products",
        token: "CG1",
        subCategories: [
          { name: "Fresh Cuts", token: "SC1" },
          { name: "Wings", token: "SC2" },
        ],
      },
      { name: "Live Birds", token: "CG2", subCategories: [{ name: "Broiler", token: "SC3" }] },
    ],
    [
      { subCategoryToken: "SC1", name: "Leg Piece", token: "P1", unitCode: "kg", currentPrice: "520.00", imageKey: "products/leg-piece.webp" },
      { subCategoryToken: "SC1", name: "Boneless", token: "P2", unitCode: "kg", currentPrice: "780.00", imageKey: "products/boneless.jpg" },
      { subCategoryToken: "SC1", name: "Curry Cut", token: "P3", unitCode: "kg", currentPrice: "480.00", imageKey: "products/curry-cut.webp" },
      { subCategoryToken: "SC1", name: "Whole Bird", token: "P4", unitCode: "piece", currentPrice: "850.00", imageKey: "products/whole-bird.webp" },
      { subCategoryToken: "SC2", name: "Plain Wings", token: "P5", unitCode: "kg", currentPrice: "450.00", imageKey: "products/wings.webp" },
      { subCategoryToken: "SC2", name: "Chicken BBQ Wings", token: "P6", unitCode: "kg", currentPrice: "620.00", imageKey: "products/wings.webp" },
      { subCategoryToken: "SC2", name: "Teriyaki Wings", token: "P7", unitCode: "kg", currentPrice: "680.00", imageKey: "products/wings.webp" },
      { subCategoryToken: "SC3", name: "Broiler (Live)", token: "P8", unitCode: "kg", currentPrice: "290.00", imageKey: "products/broiler-live.jpg" },
      { subCategoryToken: "SC3", name: "Broiler (Dressed)", token: "P9", unitCode: "kg", currentPrice: "350.00", imageKey: "products/broiler-dressed.webp" },
    ],
  );

  // Downtown Branch — a smaller, deliberately different catalog, to prove
  // the two branches are actually independent rather than mirrored.
  await seedCatalogForBranch(
    branch2!.id,
    [
      { name: "Kilogram", code: "kg", type: "weight", isBase: true },
      { name: "Piece", code: "piece", type: "count", isBase: true },
      { name: "Gram", code: "g", type: "weight", isBase: false, baseCode: "kg", conversionFactor: "0.001" },
    ],
    [
      {
        name: "Finished Output Products",
        token: "CG1",
        subCategories: [{ name: "Fresh Cuts", token: "SC1" }],
      },
    ],
    [
      { subCategoryToken: "SC1", name: "Leg Piece", token: "P1", unitCode: "kg", currentPrice: "540.00", imageKey: "products/leg-piece.webp" },
      { subCategoryToken: "SC1", name: "Whole Bird", token: "P4", unitCode: "piece", currentPrice: "870.00", imageKey: "products/whole-bird.webp" },
    ],
  );

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

  await db.insert(paymentMethods).values({
    tenantId: tenant!.id,
    name: "Digital Wallet",
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
      conditionType: "payment_method",
      conditionPaymentMethodId: pmCard!.id,
    },
  ]);

  await db.insert(productChargeCategoryAssignment).values({
    tenantId: tenant!.id,
    chargeCategoryId: gstId,
    assignmentLevel: "branch",
    targetId: branch!.id,
    overrideType: "override_on",
  });

  console.log("Seed complete");
  console.log("  Branches seeded: Main Counter (B1), Downtown Branch (B2)");
  console.log("  Owner login:   owner / owner123");
  console.log("  Cashier login: cashier / cashier123 (must count till, reports to senior)");
  console.log("  Downtown login: downtown_cashier / downtown123 (Downtown Branch only)");
  console.log("  Senior login:  senior / senior123 (Chief Cashier — skips counting, receives handovers)");
  console.log("  Currency denominations seeded: 5000/1000/500/100/50/20/10 notes, 10/5/2/1 coins");
  console.log("");
  console.log("  Catalog is now per-branch:");
  console.log("  Main Counter — units: kg, g, maund, lb, piece, dozen");
  console.log("    Finished Output Products");
  console.log("      ├── Fresh Cuts  → Leg Piece, Boneless, Curry Cut, Whole Bird");
  console.log("      └── Wings       → Plain Wings, Chicken BBQ Wings, Teriyaki Wings");
  console.log("    Live Birds");
  console.log("      └── Broiler     → Broiler (Live), Broiler (Dressed)");
  console.log("  Downtown Branch — units: kg, g");
  console.log("    Finished Output Products");
  console.log("      └── Fresh Cuts  → Leg Piece, Whole Bird (different prices than Main Counter)");
  console.log("");
  console.log("  Payment methods seeded: Cash (rounding required), Card, Bank Transfer, Digital Wallet");
  console.log("  Charge categories seeded:");
  console.log("    GST (tax, branch-wide)   — 15% cash / 17% everything else");
  await closeDb();
}

main().catch(async (error) => {
  console.error("Seed failed:", error);
  await closeDb();
  process.exit(1);
});