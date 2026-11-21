# OTD — Outfit The Day

[![CI](https://github.com/moecode-c/Outfit-The-Day/actions/workflows/ci.yml/badge.svg)](https://github.com/moecode-c/Outfit-The-Day/actions/workflows/ci.yml)

A fashion-only, multi-vendor marketplace for Egypt with an editorial, black-and-white design. Brands sell, the platform takes a commission, and customers pay cash on delivery or by InstaPay. The site is in English and Arabic (right-to-left), with dark mode.

| Part | Stack |
|---|---|
| `apps/web` | Next.js 15 (App Router), next-intl, Tailwind CSS, Framer Motion, Lenis |
| `apps/api` | NestJS 11, MongoDB + Mongoose, JWT cookies, argon2, @nestjs/schedule |
| `packages/shared` | Shared TypeScript types and enums |

No Docker: MongoDB runs as a local service in development and on MongoDB Atlas in production.

## What's in it

- **Shop**: editorial home page, Women/Men/Kids departments, categories, brand pages, shoppable looks, search in English and Arabic with filters and sorting, product pages with per-color photos, size guides and reviews, wishlist, bag drawer.
- **Checkout**: one bag across several brands, split into one order per brand. Shipping is set per seller and governorate. Payment is cash on delivery or InstaPay with an uploaded proof. Coupons are funded by the platform. Stock is reserved at checkout.
- **Customer account**: order tracking, cancelling, printable and PDF invoices, returns, reviews, addresses, notifications.
- **Seller panel**: application and approval, store profile, products with colors × sizes, discounts, looks, size guides, order fulfilment (confirm → process → ship → deliver), InstaPay proof review, returns, a commission ledger, invoices and payments, with PDF invoices and PDF/Excel statements.
- **Admin panel**: dashboard; approval of sellers, products and reviews; categories, coupons, orders, returns, finance and payment checks, users, admins with permissions; CMS (banners, home sections, pages); shipping zones; CSV and Excel reports; email outbox; settings.
- **Background jobs**: InstaPay proof timeouts, flags for late returns, discount start and end, billing cycles, late-payment warnings and suspension.

Status and the remaining launch work are tracked in [PLAN.md](PLAN.md#7-delivery-phases). The MVP features are built; what is left is deployment and the launch items the owner provides (legal text, domain, accounts).

## Getting started

Requirements: Node 24, pnpm 10 (`corepack enable`), and MongoDB on `localhost:27017`.

```bash
pnpm install
```

```bash
cp apps/api/.env.example apps/api/.env
```

```bash
cp apps/web/.env.example apps/web/.env.local
```

```bash
pnpm --filter @otd/shared build
```

```bash
pnpm seed
```

```bash
pnpm dev
```

- Web: http://localhost:3000. It proxies `/api/*` to the API.
- API: http://localhost:4000/api. Health check: `/api/health`.

`pnpm seed` wipes the `otd` database and recreates demo brands, products, looks, coupons and accounts: one admin, three sellers and one customer. Their logins are listed at the top of [apps/api/src/seed.ts](apps/api/src/seed.ts). They are for local use only.

## Scripts (repo root)

| Command | What it does |
|---|---|
| `pnpm dev` | Runs the web and API in watch mode |
| `pnpm build` | Builds shared, then the API, then the web |
| `pnpm seed` | Resets the database to the demo data |
| `pnpm lint` / `pnpm typecheck` | ESLint and TypeScript checks for both apps |
| `pnpm test` | Unit tests (Jest for the API, Vitest for the web) |
| `pnpm test:all` | The whole CI suite locally, against a separate `otd_test` database |

## Testing and CI

Every push and pull request runs GitHub Actions: lint and type-check, unit tests, API integration tests against a real MongoDB, a 54-check full marketplace scenario, and Playwright browser tests on desktop and mobile. The browser tests include smoke, accessibility and security checks. See [TESTING.md](TESTING.md).

## Configuration

| Variable | App | Default | Purpose |
|---|---|---|---|
| `MONGODB_URI` | api | `mongodb://localhost:27017/otd` | Mongo connection string |
| `PORT` | api | `4000` | API port |
| `WEB_ORIGIN` | api | `http://localhost:3000` | Allowed CORS origin, and the base for links in emails |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | api | — | Token signing secrets: two different random values of 32+ characters (`openssl rand -hex 32`). The API refuses to start in production with weak ones |
| `UPLOAD_DIR` | api | `./uploads` | Where uploaded files are stored when R2 is not configured |
| `R2_BUCKET`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | api | unset | Cloudflare R2 storage for uploads (all four, or none). Required in production unless `ALLOW_DISK_UPLOADS=true` |
| `R2_ENDPOINT` | api | `https://<account>.r2.cloudflarestorage.com` | Override for any S3-compatible store |
| `ALLOW_DISK_UPLOADS` | api | unset | Production only: accept disk uploads (only on a persistent disk) |
| `BACKUP_DIR`, `BACKUP_KEEP` | api | `./backups`, `14` | Where `pnpm --filter api backup` writes, and how many backups it keeps |
| `BREVO_API_KEY` | api | unset | Sends email (verification, password reset, order updates) through the Brevo API. Needs `MAIL_FROM` |
| `MAIL_FROM` | api | `OTD <no-reply@otd.eg>` | Sender, e.g. `OTD <no-reply@your-domain>`. With Brevo it must be a sender verified in your Brevo account |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | api | unset | SMTP alternative, used only when `BREVO_API_KEY` is unset. Without either, emails are kept in the admin outbox |
| `THROTTLE_DISABLED` | api | unset | Tests only: turns off rate limiting. Ignored when `NODE_ENV=production` |
| `API_URL` | web | `http://localhost:4000` | API address used for server rendering and the `/api` proxy |
| `SITE_URL` | web | `http://localhost:3000` | Public site URL, used in metadata |

## Deployment (planned)

- Web: Vercel, with `API_URL` and `SITE_URL` set.
- API: Railway or Render, running `pnpm --filter @otd/shared build && pnpm --filter api build`, then `node apps/api/dist/main`.
- Database: MongoDB Atlas.

Before going live, change the demo accounts. In production (`NODE_ENV=production`) the API checks its configuration at start-up and refuses to boot with placeholder or short JWT secrets, a non-https `WEB_ORIGIN`, a localhost database, or no R2 storage (the disk on Railway/Render is wiped on each deploy).

## Security notes

- Auth cookies (`otd_at`, `otd_rt`) are httpOnly and SameSite=Lax.
- CSRF: double-submit token. The API sets a readable `otd_csrf` cookie, and every POST/PUT/PATCH/DELETE must echo it in the `x-csrf-token` header. The web client does this automatically; `GET /api/auth/csrf` returns a token. Requests authenticated only with an `Authorization` header are exempt.
- Rate limiting, helmet headers, content-sniffed uploads, and private files behind access checks.
- Password reset: `/forgot` emails a single-use link (stored as a sha256 hash, valid 1 hour, at most one email per account per minute). The answer is the same whether or not the email exists. Resetting signs the account out on every device and sends a "password changed" email. Reset emails are stored redacted in the admin outbox once a provider sends them.
- Sessions: each signed-in device has its own refresh token (up to 10 per account). Logging out revokes it on the server; changing the password signs out the other devices.

## Backups

`pnpm --filter api backup` writes every collection as gzipped Extended JSON to `backups/otd-<timestamp>/` (keeping the newest `BACKUP_KEEP`) and, when R2 is configured, also uploads it to `backups/` in the bucket. Restore with `pnpm --filter api restore -- <folder>` (a dry run), and add `--confirm` to replace the data. On Atlas, also turn on Cloud Backup for point-in-time recovery. Uploaded files live in R2 and are not part of this backup.
