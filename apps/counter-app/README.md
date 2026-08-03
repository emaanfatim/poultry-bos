# Counter App — Cashier Portal (MVP)

Next.js PWA for frontline cashiers. Implements MVP Section 14 from the BOS requirements document.

## Features

- **Login** — Owner (`owner` / `owner123`) or Cashier (`cashier` / `cashier123`)
- **Sales (POS)** — Product grid, cart, manual weight/qty entry, cash checkout
- **Bill / Receipt** — Itemized receipt with print support
- **Today's Rates** — Owner-only bulk price update screen
- **Daily Summary** — Revenue, transaction count, product breakdown
- **Bilingual** — English / Urdu with RTL support

## Run locally

From the repo root:

```bash
# 1. Start PostgreSQL
docker compose up -d

# 2. Copy env files
cp .env.example .env
cp apps/counter-app/.env.local.example apps/counter-app/.env.local

# 3. Install dependencies
pnpm install

# 4. Generate & run migrations, seed demo data
pnpm db:generate
pnpm db:migrate
pnpm db:seed

# 5. Start API + Counter App
pnpm dev
```

- Counter App: http://localhost:3000
- API: http://localhost:4000

## Architecture notes

Built on the shared BOS data model with `tenant_id` on every table. Transaction records are append-only and structured for future Ledger integration (optional `customer_id` field deferred to Phase 2).
