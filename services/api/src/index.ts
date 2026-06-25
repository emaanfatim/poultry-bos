import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { authRoutes } from "./routes/auth.js";
import { productRoutes } from "./routes/products.js";
import { salesRoutes } from "./routes/sales.js";

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
    allowMethods: ["GET", "POST", "PUT", "OPTIONS"],
  }),
);

app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/auth", authRoutes);
app.route("/products", productRoutes);
app.route("/sales", salesRoutes);

const port = Number(process.env.PORT ?? 4000);

serve({ fetch: app.fetch, port });

console.log(`API running on http://localhost:${port}`);
