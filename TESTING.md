# Testing & CI

Every push to `main` and every pull request runs `.github/workflows/ci.yml` on GitHub Actions (MongoDB 7 runs as a service container; no Docker needed locally).

| CI job | What it checks | Where the tests live |
|---|---|---|
| **Lint & type-check** | ESLint + `tsc --noEmit` for API and web | `apps/*/eslint.config.mjs` |
| **Unit tests** | Pricing, seller discounts, coupon splitting, Arabic search normalisation, slugs, pagination, Egyptian phone validation · money/date formatting, EN↔AR translation parity (same keys, same placeholders, no empty strings, every `t('key')` in the code exists), i18n middleware matcher | `apps/api/src/**/*.spec.ts` (Jest) · `apps/web/test/unit` (Vitest) |
| **API integration** | Built API + real MongoDB over HTTP: health, helmet headers, CORS, validation errors, auth lifecycle, forged tokens, role/permission matrix, catalog filters/sort/search, cart totals, coupons, stock guards, order privacy, file-upload sniffing and private-file access | `apps/api/test/integration/*.test.mjs` (node:test) |
| | Full money flow: multi-brand COD + InstaPay checkout, fulfilment, commission & coupon credits, reviews, returns/refunds, billing, seller payments, onboarding, moderation (54 checks) | `apps/api/scripts/e2e.mjs` |
| **E2E (Playwright)** | Real browser on production builds, desktop + mobile: storefront, Arabic RTL, language switch, dark mode, search, register/sign-in, guards, bag → checkout → seller fulfilment → delivered, admin approval | `apps/web/e2e/*.spec.ts` |
| | Side tests: every public page in EN + AR without crashes/console errors/5xx, every admin/seller/account section, axe accessibility audit (WCAG 2.1 AA), httpOnly cookies, private uploads, XSS in search | `smoke`, `admin`, `a11y`, `security` specs |
| **Dependency audit** | `pnpm audit --prod` for high-severity advisories (report only) | — |

Reports: the Playwright HTML report is uploaded as a build artifact on every run; traces, screenshots, videos and server logs are uploaded when a job fails.

## Run it locally

Needs MongoDB on `localhost:27017`. Uses a separate `otd_test` database, API on `:4100` and web on `:3100` (set `TEST_WEB_PORT` if something else uses 3100), so your dev data and dev servers are untouched.

```bash
pnpm test:all
```

Single stages: `pnpm test:all -- --only=lint|unit|api|e2e` (add `--skip-build` to reuse builds). Quick unit run: `pnpm test`.

Test-only switch: `THROTTLE_DISABLED=true` turns off rate limiting so suites can log in many times; it is ignored when `NODE_ENV=production`.
