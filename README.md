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
- **Customer account**: order tracking, cancelling, printable invoices, returns, reviews, addresses, notifications.
- **Seller panel**: application and approval, store profile, products with colors × sizes, discounts, looks, size guides, order fulfilment (confirm → process → ship → deliver), InstaPay proof review, returns, a commission ledger, invoices and payments.
- **Admin panel**: dashboard; approval of sellers, products and reviews; categories, coupons, orders, returns, finance and payment checks, users, admins with permissions; CMS (banners, home sections, pages); shipping zones; CSV reports; email outbox; settings.
- **Background jobs**: InstaPay proof timeouts, flags for late returns, discount start and end, billing cycles, late-payment warnings and suspension.

Status and the remaining launch work are tracked in [PLAN.md](PLAN.md#7-delivery-phases). Not built yet: Google sign-in, R2 storage, XLSX/PDF exports, CSRF tokens, and deployment.

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
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | api | — | Token signing secrets. Use long random values in production |
| `UPLOAD_DIR` | api | `./uploads` | Where uploaded files are stored |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | api | unset | Email sending. Without SMTP, emails are kept in the admin outbox |
| `THROTTLE_DISABLED` | api | unset | Tests only: turns off rate limiting. Ignored when `NODE_ENV=production` |
| `API_URL` | web | `http://localhost:4000` | API address used for server rendering and the `/api` proxy |
| `SITE_URL` | web | `http://localhost:3000` | Public site URL, used in metadata |

## Deployment (planned)

- Web: Vercel, with `API_URL` and `SITE_URL` set.
- API: Railway or Render, running `pnpm --filter @otd/shared build && pnpm --filter api build`, then `node apps/api/dist/main`.
- Database: MongoDB Atlas.

Before going live, change the demo accounts and secrets. Uploads also need persistent storage (R2), because the disk on Railway/Render is wiped on each deploy.
