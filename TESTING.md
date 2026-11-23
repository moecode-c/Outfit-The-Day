# Testing & CI

Every push to `main`, every pull request and a nightly schedule run `.github/workflows/ci.yml` on GitHub Actions (MongoDB runs as a service container; no Docker needed locally). The app is built **once** in the `build` job and every job that runs it downloads that build, so all suites test the same artifact.

| CI job | What it checks | Where the tests live |
|---|---|---|
| **Lint workflows** | `actionlint` on every workflow file | `.github/workflows` |
| **Lint & type-check** | ESLint + `tsc --noEmit` for API and web; fails on a stray `.only()` in tests | `apps/*/eslint.config.mjs` |
| **Unit tests (Node 22, 24)** | Pricing, seller discounts, coupon splitting, Arabic search normalisation, slugs, pagination, Egyptian phone validation, env guard, mail, storage · money/date formatting, EN↔AR translation parity, i18n middleware matcher, SEO. Coverage is reported in the job summary and uploaded (not enforced) | `apps/api/src/**/*.spec.ts` (Jest) · `apps/web/test/unit` (Vitest) |
| **Production build** | `pnpm build` (shared + API + Next.js) with the Next cache; build sizes in the job summary | — |
| **API integration (MongoDB 7, 8)** | Built API + real MongoDB over HTTP: health, helmet headers, CORS, validation errors, auth lifecycle, forged tokens, role/permission matrix, catalog filters/sort/search, cart totals, coupons, stock guards, order privacy, exports, file-upload sniffing and private-file access | `apps/api/test/integration/*.test.mjs` (node:test) |
| | Full money flow: multi-brand COD + InstaPay checkout, fulfilment, commission & coupon credits, reviews, returns/refunds, billing, seller payments, onboarding, moderation | `apps/api/scripts/e2e.mjs` |
| | Backup → wipe → restore round trip: every collection backed up, dry run changes nothing, restore gives identical documents | `apps/api/test/backup-roundtrip.mjs` |
| | Production mode: weak config refuses to boot; valid config boots with HSTS/CSP, CORS only for `WEB_ORIGIN`, Secure + HttpOnly cookies, rate limiting on even with `THROTTLE_DISABLED=true` | `apps/api/test/prod-smoke.mjs` |
| **E2E (Chromium desktop + mobile)** | Real browser on the production build: storefront, Arabic RTL, language switch, dark mode, search, register/sign-in, guards, bag → checkout → seller fulfilment → delivered, admin approval | `apps/web/e2e/*.spec.ts` |
| | Side tests: every public page in EN + AR without crashes/console errors/5xx, every admin/seller/account section, axe accessibility audit (WCAG 2.1 AA), httpOnly cookies, private uploads, XSS in search | `smoke`, `admin`, `a11y`, `security` specs |
| **E2E (Firefox, WebKit, iPhone Safari)** | Same suite in the other engines. Nightly, or on a manual run with *all browsers* ticked | `PW_ALL_BROWSERS=1` projects in `playwright.config.ts` |
| **Lighthouse** | Home (EN/AR), category, brands, search. Accessibility ≥ 90 is enforced; performance, best practices and SEO are reported in the job summary | `.github/lighthouse/lighthouserc.json` |
| **Secret scan** | `gitleaks` over the whole git history | — |
| **Dependency review** (PRs) | Blocks new dependencies with high-severity advisories | — |
| **Dependency audit** | `pnpm audit --prod` for high-severity advisories (report only) | — |
| **CI passed** | One check that is green only when every job above passed or was skipped on purpose. Use it as the required check in branch protection | — |

Also in `.github/`: **CodeQL** (`codeql.yml`, security-extended queries for TypeScript and the workflows, on every push/PR and weekly) and **Dependabot** (`dependabot.yml`, weekly grouped npm and Actions updates).

Reports: Playwright HTML reports, Lighthouse reports and unit coverage are uploaded as build artifacts on every run; traces, screenshots, videos and server logs are uploaded when a job fails.

## Run it locally

Needs MongoDB on `localhost:27017`. Uses a separate `otd_test` database, API on `:4100` and web on `:3100` (set `TEST_WEB_PORT` if something else uses 3100), so your dev data and dev servers are untouched.

```bash
pnpm test:all
```

Single stages: `pnpm test:all -- --only=lint|unit|api|e2e` (add `--skip-build` to reuse builds). Quick unit run: `pnpm test`.

Test-only switch: `THROTTLE_DISABLED=true` turns off rate limiting so suites can log in many times; it is ignored when `NODE_ENV=production`.

Extra API checks (need a seeded database and `pnpm --filter api build`):

```bash
MONGODB_URI=mongodb://localhost:27017/otd_test pnpm --filter api test:backup
PROD_MONGODB_URI=mongodb://localtest.me:27017/otd_test pnpm --filter api test:prod-smoke   # any host name except localhost/127.0.0.1
```

Cross-browser locally: `PW_ALL_BROWSERS=1 pnpm --filter web exec playwright test --project=firefox --project=webkit --project=mobile-safari` (after `playwright install firefox webkit`).
