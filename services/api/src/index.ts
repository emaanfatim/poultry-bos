import "dotenv/config";
import path from "node:path";
import dotenv from "dotenv";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { authRoutes } from "./routes/auth.js";
import { productRoutes } from "./routes/products.js";
import { salesRoutes } from "./routes/sales.js";
import { categoryRoutes } from "./routes/categories";
import { draftsRoutes } from "./routes/drafts.js";
import { unitsRoutes } from "./routes/units.js";
import { tillRoutes } from "./routes/till.js";
import { usersRoutes } from "./routes/users.js";


dotenv.config({
  path: path.resolve(process.cwd(), "../../.env"),
});

console.log("API DATABASE_URL =", process.env.DATABASE_URL);

const app = new Hono();

app.use(
  "*",
  cors({
    origin: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      process.env.COUNTER_APP_URL ?? "",
    ].filter(Boolean),
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  }),
);

app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/auth", authRoutes);
app.route("/products", productRoutes);
app.route("/sales", salesRoutes);
app.route("/categories", categoryRoutes);
app.route("/drafts", draftsRoutes);
app.route("/units", unitsRoutes);
app.route("/till", tillRoutes);
app.route("/users", usersRoutes);

const port = Number(process.env.PORT ?? 4000);

serve({ fetch: app.fetch, port });

console.log(`API running on http://localhost:${port}`);