# OTD Web

The storefront, customer account, seller panel and admin panel for OTD, built with Next.js 15 (App Router).

- **Languages**: next-intl with `/en` and `/ar` routes; Arabic is right-to-left. The text lives in `messages/en.json` and `messages/ar.json`, and a unit test checks that both files have the same keys and placeholders.
- **Design**: editorial black and white, Tailwind CSS with logical properties (`ms-`, `pe-`), a dark mode toggle that is remembered, Framer Motion reveals, and Lenis smooth scrolling. Motion is reduced when the system asks for it.
- **Data**: server components call the API directly (`src/lib/server.ts`, using `API_URL`). The browser calls `/api/*` on the same site, which `next.config.ts` forwards to the API, so the auth cookies stay first-party.

## Layout

| Path | Contents |
|---|---|
| `src/app/[locale]/(site)/` | All pages: shop, auth, `account/`, `seller/`, `admin/` |
| `src/components/ui` | UI kit: buttons, inputs, file upload, tables, dialogs |
| `src/components/shop` | Header, listings, filters, product view, bag drawer, address form, panel shells |
| `src/components/seller` | Product editor, invoice view |
| `src/lib/` | API client, server fetch, bag/session store, money and date formatting |
| `src/i18n/`, `src/middleware.ts` | Locale routing |

## Running

The API must be running too. From the repo root, `pnpm dev` starts both.

```bash
pnpm --filter web dev
```

Environment variables are in [`.env.example`](.env.example): `API_URL` (default `http://localhost:4000`) and `SITE_URL`.

## Tests

| Script | What it runs |
|---|---|
| `pnpm --filter web test` | Vitest unit tests (`test/unit`): formatting, translation file checks, middleware matcher |
| `pnpm --filter web test:e2e` | Playwright (`e2e/`) against a running web + API at `WEB_URL` (default `http://localhost:3100`). Covers the storefront, auth, checkout through delivery, admin approval, smoke tests of every page in EN and AR, accessibility (axe) and security |

`pnpm test:all` from the repo root builds everything, starts throwaway servers and runs all of it. See [TESTING.md](../../TESTING.md).
