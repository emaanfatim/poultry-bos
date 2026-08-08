import dotenv from "dotenv";
import path from "node:path";
import { eq } from "drizzle-orm";
import { closeDb, createDb } from "./index.ts";
import { branches, tenants } from "./schema/index.ts";

dotenv.config({
  path: path.resolve(process.cwd(), "../../.env"),
});

// One-off helper for local testing of the Owner Portal branch switcher.
// Adds a second branch to whatever tenant the seed script already created.
// Safe to run more than once — skips if a branch with this name already
// exists for the tenant.
async function main() {
  const db = createDb();

  const [tenant] = await db.select().from(tenants).limit(1);
  if (!tenant) {
    console.log("No tenant found — run `pnpm db:seed` first.");
    return;
  }

  const branchName = process.argv[2] ?? "Downtown Branch";
  const branchToken = process.argv[3] ?? "B2";

  const existing = await db
    .select()
    .from(branches)
    .where(eq(branches.tenantId, tenant.id));

  if (existing.some((b) => b.name === branchName)) {
    console.log(`Branch "${branchName}" already exists — skipping.`);
    return;
  }

  const [created] = await db
    .insert(branches)
    .values({
      tenantId: tenant.id,
      name: branchName,
      token: branchToken,
    })
    .returning();

  console.log(`Created branch "${created!.name}" (id: ${created!.id}) for tenant "${tenant.name}".`);
  console.log("Log into the Owner Portal as the existing owner account and the switcher should now show both branches.");
}

main()
  .then(() => closeDb())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });