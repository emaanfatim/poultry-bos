import dotenv from "dotenv";
import path from "node:path";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { fileURLToPath } from "node:url";
import { createDb, closeDb } from "./index.js";

dotenv.config({
  path: path.resolve(process.cwd(), "../../.env"),
});

console.log("DATABASE_URL =", process.env.DATABASE_URL);

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
