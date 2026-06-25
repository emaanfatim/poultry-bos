import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb, closeDb } from "./index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const db = createDb();
  await migrate(db, { migrationsFolder: path.join(__dirname, "../drizzle") });
  console.log("Migrations applied successfully");
  await closeDb();
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
