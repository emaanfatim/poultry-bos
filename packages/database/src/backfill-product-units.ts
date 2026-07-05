// Run once after `pnpm db:migrate` picks up the new `product_units` table.
// - Adds a "Pound" (lb) unit per tenant, converting into that tenant's Kilogram.
// - Links every product to its own priced unit + every other active unit of the
//   same type (this matches today's "any same-type unit is sellable" behavior —
//   owners can narrow it per product afterwards from Prices → Sellable units).
// Safe to re-run.
import dotenv from "dotenv";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { closeDb, createDb } from "./index.ts";
import { productUnits, products, tenants, units } from "./schema/index.ts";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

const LB_PER_KG = "0.45359237";

async function main() {
  const db = createDb();
  const allTenants = await db.select().from(tenants);

  for (const tenant of allTenants) {
    const tenantUnits = await db.select().from(units).where(eq(units.tenantId, tenant.id));

    const kg = tenantUnits.find((u) => u.type === "weight" && u.isBase);
    let pound = tenantUnits.find((u) => u.code === "lb");

    if (kg && !pound) {
      const [inserted] = await db
        .insert(units)
        .values({
          tenantId: tenant.id,
          name: "Pound",
          code: "lb",
          type: "weight",
          isBase: false,
          baseUnitId: kg.id,
          conversionFactor: LB_PER_KG,
          isActive: true,
        })
        .returning();
      pound = inserted;
      console.log(`Added Pound (lb) for ${tenant.name}`);
    }

    const allUnitsNow = pound && !tenantUnits.some((u) => u.id === pound!.id)
      ? [...tenantUnits, pound]
      : tenantUnits;

    const tenantProducts = await db.select().from(products).where(eq(products.tenantId, tenant.id));

    for (const product of tenantProducts) {
      const priceUnit = allUnitsNow.find((u) => u.id === product.unitId);
      if (!priceUnit) continue;

      const sellable = allUnitsNow.filter((u) => u.type === priceUnit.type && u.isActive);

      for (const unit of sellable) {
        const [existing] = await db
          .select()
          .from(productUnits)
          .where(and(eq(productUnits.productId, product.id), eq(productUnits.unitId, unit.id)))
          .limit(1);

        if (!existing) {
          await db.insert(productUnits).values({
            tenantId: tenant.id,
            productId: product.id,
            unitId: unit.id,
          });
        }
      }
    }

    console.log(`Linked units for ${tenant.name}: ${tenantProducts.length} products`);
  }

  await closeDb();
}

main().catch(async (error) => {
  console.error("Backfill failed:", error);
  await closeDb();
  process.exit(1);
});
