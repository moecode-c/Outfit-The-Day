# OTD API

The NestJS 11 + MongoDB (Mongoose) REST API for OTD. Every route sits under `/api`. In the browser the web app proxies `/api/*` here, so the auth cookies (`otd_at` and `otd_rt`, both httpOnly) stay first-party.

## Layout

| Path | Contents |
|---|---|
| `src/main.ts` | Bootstrap: helmet, CORS (`WEB_ORIGIN`), cookie parser, `/api` prefix, static `/uploads` |
| `src/app.module.ts` | Module wiring, rate limiting (300 requests/min per IP), `GET /api/health` |
| `src/db/` | Mongoose schemas for all collections, the connection, and the settings service (admin-editable config) |
| `src/common/auth.ts` | JWT guard, `@Roles` / `@AdminPerm` / `@Public` decorators, `@CurrentUser` |
| `src/common/pricing.ts` | Seller discounts, variant pricing, cart totals, how a coupon is split across brands |
| `src/common/util.ts` | Arabic search folding, slugs, pagination, validators (Egyptian phone, ObjectId), money helpers |
| `src/modules/auth.ts` | Register, login, refresh, logout, email verification, forgot/reset password, change password |
| `src/modules/account.ts` | Profile, addresses, wishlist, seller application; `geo` (governorates and cities) |
| `src/modules/catalog.ts` | Public catalog (products, search, filters, categories, brands, looks, content) and seller products, size guides and looks; admin product moderation |
| `src/modules/files.ts` | Uploads with content sniffing; public and private files with access checks |
| `src/modules/orders.ts` | Cart pricing, coupons, checkout, the order lifecycle, InstaPay proofs, cancellations, returns, reviews; the seller and admin order endpoints |
| `src/modules/notify.ts` | In-site notifications and email (SMTP, or the outbox when SMTP isn't set) |
| `src/modules/finance.ts` | Commission ledger, billing cycles and invoices, seller payments and their verification |
| `src/modules/admin.ts` | Dashboard, sellers, users, admins and permissions, categories, coupons, CMS, shipping, reports (CSV), settings, outbox |
| `src/seed.ts` | Resets the database to the demo data (demo logins are listed in the file header) |

Money is stored as integer **piasters** (1 EGP = 100). Query filters such as `minPrice` and `maxPrice` take EGP.

## Scheduled jobs

| Schedule | Job |
|---|---|
| every 10 min | Cancel InstaPay orders whose proof deadline has passed |
| every 30 min | Refresh sale prices when seller discounts start or end |
| hourly | Flag returns the seller didn't answer in time and notify admins |
| daily 01:00 | Generate commission invoices for finished billing cycles |
| daily 09:00 | Warn about late payments, and suspend sellers who are past the limit |

## Running

From the repo root:

```bash
pnpm --filter @otd/shared build
```

```bash
pnpm --filter api dev
```

Other scripts: `build`, `start:prod` (`node dist/main`), `seed`, `lint`, `typecheck`.

Environment variables are listed in [`.env.example`](.env.example) and in the root [README](../../README.md#configuration).

## Tests

| Script | What it runs |
|---|---|
| `pnpm --filter api test` | Jest unit tests (`src/**/*.spec.ts`): pricing, coupons, utilities |
| `pnpm --filter api test:int` | `node:test` HTTP integration tests (`test/integration`) against a running API (`API` env var, default `http://localhost:4000/api`) |
| `pnpm --filter api test:e2e` | The 54-check full marketplace scenario (`scripts/e2e.mjs`) against a freshly seeded API |

Seed first, and point the integration tests at a throwaway database. `pnpm test:all` from the root handles both. See [TESTING.md](../../TESTING.md).
