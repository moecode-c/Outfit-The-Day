# OTD — Outfit The Day: Master Plan

A premium, fashion-only, multi-vendor marketplace for Egypt (think Amazon, but fashion only, with an editorial look).
Based on *Multi-Vendor Marketplace MVP Scope and Feature Specification* (MVP 1.0), adapted to fashion and to the decisions below.

---

## 1. Locked decisions

| Topic | Decision |
|---|---|
| Frontend | **Next.js** (App Router, TypeScript, Tailwind CSS, Framer Motion, next-intl) |
| Backend | **NestJS** (TypeScript, REST, **MongoDB + Mongoose**). No Docker: local MongoDB service in dev, MongoDB Atlas in prod |
| Jobs | @nestjs/schedule cron (no Redis) |
| Repo | pnpm monorepo: `apps/web`, `apps/api`, `packages/shared` |
| Team | Solo, experienced developer + Claude |
| Market | Egypt, EGP, **English default**, Arabic (RTL) second language |
| Hosting | Web → Vercel · API → Railway/Render · DB → MongoDB Atlas · Files → local disk in dev, Cloudflare R2 in prod |
| Design | **Editorial / magazine**, premium, **strict black and white monochrome** (no accent color) |
| Premium UI | Smooth scroll and motion, full-bleed editorial hero, quick-view and slide-out bag, dark mode toggle |
| Fashion features | Size guides per brand · color swatches with per-color photos · Women / Men / Kids navigation · "Complete the Look" outfits |
| Brands | **Seller = Brand** (one store is one brand). "Local coupons" target specific sellers/brands |
| Coupon funding | **The platform funds admin coupons.** The seller receives the full price, and the coupon amount is credited against the commission they owe |
| Payments | Cash on delivery + InstaPay (customer uploads a screenshot). No payment gateway in the MVP |
| Commission | **Configurable, to be decided later.** Default % plus overrides per category and per seller. Weekly or monthly cycle set in admin |
| Returns | 14-day window. Seller pays return shipping if the item is faulty or wrong; customer pays for change of mind or wrong size. Underwear, swimwear and earrings are non-returnable (configurable per category) |
| Moderation | **The admin approves every product** before it goes live |

### Defaults for the remaining open items (all admin-configurable)
- Max cash-on-delivery order: 10,000 EGP. A customer is blocked from cash on delivery after 2 failed or refused deliveries.
- Seller documents: national ID is mandatory; commercial register and tax number are optional. An InstaPay handle is mandatory.
- Late payment: due 5 days after the invoice, warning at 7 days overdue, auto-suspend at 14 days overdue.
- Rejected InstaPay proof: the customer has 24 hours to re-upload before the order auto-cancels.
- Seller return response deadline: 3 days, then the case is flagged to the admin.

---

## 2. Architecture

```
┌──────────────┐  /api/* proxy  ┌───────────────┐  Mongoose  ┌─────────────────┐
│ Next.js web  │ ─────────────▶ │  NestJS API   │ ─────────▶ │ MongoDB (Atlas) │
│ (Vercel)     │ ◀───────────── │ (Railway /    │            └─────────────────┘
│ SSR          │  JWT cookies   │  Render)      │ ──▶ @nestjs/schedule cron jobs (in-process)
└──────────────┘                │               │ ──▶ Files: local disk now, Cloudflare R2 planned
                                │               │ ──▶ SMTP email (falls back to the admin outbox)
                                └───────────────┘
```

- **Auth**: JWT access token (15 min) and refresh token (30 days) in httpOnly secure cookies, argon2 password hashing, Google OAuth (planned, not built yet), and role guards (`CUSTOMER`, `SELLER`, `ADMIN`) plus admin permission flags.
- **Background jobs (@nestjs/schedule cron, no Redis)**: discount start/end refresh, InstaPay proof timeouts, weekly or monthly commission invoices, overdue reminders and auto-suspend, flags when a seller misses a return deadline.
- **Search**: a normalized `searchText` field on each product with Arabic folding (unify the alef forms, ة→ه, ى→ي, strip diacritics), matched token by token with escaped regexes. Meilisearch is the Phase 2 upgrade.
- **Files**: uploads are type-sniffed (JPEG/PNG/WebP/PDF) and stored on local disk (`UPLOAD_DIR`). Product images are public; ID documents and payment screenshots are **private** and only served to signed-in users allowed to see them. Moving storage to Cloudflare R2 is still to do (the swap point is in `apps/api/src/modules/files.ts`).
- **i18n**: next-intl with `/en` and `/ar` routes, `dir="rtl"` for Arabic, Tailwind logical properties (`ms-`, `pe-`), and every user-facing text field stored as `{en, ar}` with fallback to the other language.
- **Money**: stored as integer **piasters** (1 EGP = 100). Prices, commission % and coupons are snapshotted onto the order when it is placed.

## 3. Repo structure

```
Outfit-The-Day/
├─ apps/
│  ├─ web/                    Next.js 15 (App Router, next-intl, Tailwind, Framer Motion)
│  │  ├─ src/app/[locale]/(site)/
│  │  │  ├─ page.tsx, [dept], c/[slug], p/[slug], brands, looks, search, pages/[slug], bag, checkout
│  │  │  ├─ login, register, verify, forgot, reset, sell
│  │  │  ├─ account/          orders (+ invoice), returns, addresses, wishlist, profile, notifications
│  │  │  ├─ seller/           dashboard, products, orders, returns, looks, size-guides, finance, store
│  │  │  └─ admin/            dashboard, sellers, products, reviews, categories, coupons, orders, returns,
│  │  │                       finance, users, admins, content, shipping, reports, outbox, settings
│  │  ├─ src/components/      UI kit, shop components, seller editor, panel shells
│  │  ├─ messages/            en.json, ar.json
│  │  └─ e2e/, test/unit/     Playwright and Vitest tests
│  └─ api/                    NestJS 11 + Mongoose
│     ├─ src/modules/         auth, account (+ geo), catalog, files, orders, notify, finance, admin
│     ├─ src/db/              schemas, connection, settings service
│     ├─ src/common/          auth guards, pricing, utilities (+ Jest specs)
│     ├─ src/seed.ts          demo data
│     ├─ scripts/e2e.mjs      full marketplace scenario
│     └─ test/integration/    HTTP integration tests (node:test)
├─ packages/shared/           shared TypeScript types and enums
├─ scripts/                   test-all.mjs (local CI run), wait-for.mjs
├─ .github/workflows/ci.yml   GitHub Actions pipeline (see TESTING.md)
└─ PLAN.md
```

## 4. Data model

Originally sketched relationally; implemented as MongoDB collections with Mongoose schemas in `apps/api/src/db/schemas.ts` (some child tables below are embedded documents there).

- **User**(id, name, email, phone, passwordHash, role, locale, emailVerifiedAt, blockedAt, codFailures) and **AdminPermission**
- **Address**(userId, governorateId, cityId, area, street, building, notes, isDefault) · **Governorate** / **City** (managed by the admin)
- **Seller**(userId, storeName{en,ar}, slug, logo, banner, description{en,ar}, instapayHandle, returnPolicy{en,ar}, status `PENDING|APPROVED|REJECTED|SUSPENDED`, commissionOverride, docs[]). *A seller is a brand.*
- **SellerShippingRule**(sellerId, governorateId?, fee, freeAbove, etaDays)
- **Category**(parentId, name{en,ar}, slug, image, sort, active, commissionOverride, returnable) with a top-level **Department** enum: `WOMEN | MEN | KIDS | UNISEX`
- **SizeGuide**(sellerId, name, table JSON, unit) → linked to products
- **Product**(sellerId, categoryId, department, title{en,ar}, description{en,ar}, specs JSON, material, care, status `DRAFT|PENDING|LIVE|REJECTED|HIDDEN`, rejectReason, sizeGuideId, searchVector)
- **ProductColor**(productId, name{en,ar}, hex, sort) → **ProductImage**(colorId, url, alt, sort): *each color has its own photos*
- **Variant**(productId, colorId, size, sku, stock, priceOverride)
- **Discount**(productId, type `PERCENT|FIXED_PRICE`, value, startsAt, endsAt)
- **Look**(sellerId, title{en,ar}, coverImage, status) → **LookItem**(lookId, productId): "Complete the Look"
- **Cart** / **CartItem**(variantId, qty) · **WishlistItem**
- **Coupon**(code, type, value, maxCap, startsAt, endsAt, minOrder, usageLimit, perCustomerLimit, newCustomersOnly, excludesDiscounted, scope `GLOBAL|SELLERS`, sellers[], active) · **CouponRedemption**
- **Order**(number, customerId, addressSnapshot, couponId, totals) → **SubOrder**(sellerId, status, paymentMethod `COD|INSTAPAY`, paymentStatus, shippingFee, itemsTotal, couponShare, commissionRate, commissionAmount, courier, trackingNo) → **OrderItem**(variant snapshot, unitPrice, qty)
- **OrderEvent**(subOrderId, status, actorId, note, at): the full audit log
- **PaymentProof**(subOrderId, fileKey, referenceNo **unique**, status, rejectReason)
- **ReturnRequest**(subOrderId, status, reason, photos, items[], sellerDeadline, refundProof, adminNote)
- **Review**(productId, orderItemId unique, rating, text, hidden)
- **CommissionLedgerEntry**(sellerId, subOrderId?, type `COMMISSION|COUPON_CREDIT|RETURN_REVERSAL|PAYMENT|ADJUSTMENT`, amount, invoiceId?)
- **CommissionInvoice**(sellerId, periodStart, periodEnd, total, dueAt, status) · **SellerPayment**(invoiceId, method, fileKey, referenceNo, receiptNo, status)
- **Notification**(userId, type, payload, readAt) · **Banner** / **HomeSection** / **Page**{en,ar} / **EmailTemplate** · **Setting**(key, value JSON)

### Money flow with platform-funded coupons
Customer pays the seller `items − coupon + shipping`. When the order is delivered, the ledger records a `COMMISSION` entry (rate × items after the seller's discount) and a `COUPON_CREDIT` entry (−couponShare). The seller owes the net amount. If the net is negative, the platform owes the seller, and that carries forward as a credit (a manual payout until Phase 2).

## 5. Design system: "Editorial Monochrome"

- **Palette**: `#FFFFFF` canvas, `#0A0A0A` ink, a grey scale (`#F5F5F5`, `#E5E5E5`, `#A3A3A3`, `#525252`). **No accent color.** Sale prices use ink with a strikethrough plus a black "SALE" label; errors use a single muted red, only in forms. Dark mode inverts the palette (`#0A0A0A` canvas, `#FAFAFA` ink).
- **Typography**: display serif for headlines (e.g. *Playfair Display* / *Cormorant*, set very large, tight tracking); clean grotesk for UI (*Inter* / *Neue Montreal*-style); Arabic in *IBM Plex Sans Arabic* plus *Noto Naskh Arabic* for display. Uppercase micro-labels with wide letter spacing.
- **Layout**: 12-column asymmetric editorial grids, generous whitespace, full-bleed imagery, thin 1px hairline dividers, square corners (radius 0–2px), no drop shadows.
- **Motion** (Framer Motion + Lenis smooth scroll): image clip-path reveals on scroll, a second photo cross-fades in on product card hover, page transitions, a magnetic hover on buttons, slide-out bag and filter drawers, a marquee ticker in the header. Motion is reduced when `prefers-reduced-motion` is set.
- **Signature components**: full-bleed video or photo hero with oversized headline · "The Edit" curated story blocks · product card (two images, color dots, quick-view) · quick-view modal · bag drawer · sticky add-to-bag bar on mobile · size-guide sheet · "Complete the Look" carousel · lookbook pages.
- Mobile-first, fully responsive. Lighthouse target ≥ 90.

## 6. Feature scope by role (summary; full detail in the spec)

**Guest / Customer**: browsing by department and category, brand (= store) pages, lookbooks, search (en/ar) with filters (department, category, brand, size, color, price, rating, on sale, in stock) and sorting; product page (color swatches swap the gallery, size selector with sold-out sizes disabled, size guide, Complete the Look, reviews); wishlist; bag grouped by brand; checkout (address, shipping per seller, cash on delivery / InstaPay with one proof per seller); orders (status, tracking, cancel before shipping, printable invoice); returns; reviews after delivery; email and in-site notifications.

**Seller (brand)**: application and approval, store profile, size guides, products with colors × sizes variants and per-color images (every product goes through admin approval), discounts, outfits/looks, order pipeline (confirm → processing → shipped with tracking → delivered, InstaPay proof review, cash-on-delivery collection, packing slip), returns, finance (ledger, invoices, pay commission with a proof), dashboard with a 30-day chart.

**Admin**: dashboard and alerts, seller approvals, suspensions and commission overrides, product approval queue, review moderation, categories and departments, coupons (global and per seller), commission settings and billing cycle, verifying commission payments and recording cash payments, order and dispute oversight, user blocking, CMS (banners, home sections, lookbook features, static pages, shipping zones, email templates), reports with CSV export (XLSX planned), admin users and permissions, global settings.

## 7. Delivery phases

Status as of November 2026: ✅ done · 🟡 done except the items in bold.

| # | Phase | Deliverables | Status |
|---|---|---|---|
| 0 | **Setup** | Monorepo, Next.js and NestJS apps, MongoDB + Mongoose (no Docker), shared package, lint/format, env files, CI | ✅ GitHub Actions CI with lint, unit, integration and browser tests (see `TESTING.md`) |
| 1 | **Foundation** | Design system, i18n plus RTL, layout, auth (register, login, verify, reset, Google), roles and guards, governorates/cities seed, categories and departments | 🟡 **Google sign-in** |
| 2 | **Sellers and catalog** | Seller application and approval, store profile, size guides, product CRUD with colors/sizes/images, admin approval queue, seller discounts, looks | 🟡 Uploads go to local disk; **R2 not wired up** |
| 3 | **Shopping** | Editorial home, department and category pages, search plus filters, product page, quick-view, wishlist, bag drawer, checkout, multi-seller orders, COD and InstaPay proof flow, stock reservation | ✅ |
| 4 | **Operations** | Seller order pipeline, tracking, cancellations, returns, reviews, notifications (email + in-site bell), invoices, seller dashboard | 🟡 Invoices are printable pages, **not generated PDFs** |
| 5 | **Money and promotions** | Coupons, commission engine and ledger, coupon credits, invoices per cycle, seller payments and admin verification, late-payment jobs, statements | 🟡 **No PDF/XLSX statement export** |
| 6 | **Admin and launch** | Admin panels, CMS, reports and exports, admin permissions, SEO, performance, security review, backups, legal pages, deployment | 🟡 Panels, CMS, CSV reports, permissions, rate limits, file checks and SEO (`sitemap.xml`, `robots.txt`, per-page canonical + hreflang) are done. **Still to do: CSRF tokens (SameSite cookies only today), backups, final legal text, deployment** |

### Remaining before launch
1. Google sign-in (users have a `googleId` field; there is no OAuth flow yet).
2. Cloudflare R2 for uploads (replace the disk read/write in `apps/api/src/modules/files.ts`).
3. Exports: XLSX reports, PDF invoices and statements.
4. Security: CSRF tokens on state-changing requests, production secrets, database backups (Atlas).
5. Deployment: web on Vercel, API on Railway/Render, MongoDB Atlas, domain, SMTP account. Set `SITE_URL` on the web app to the real domain, since canonical URLs, hreflang and the sitemap are built from it.

## 8. Phase 2+ (out of the MVP)
Payment gateway (Paymob/Fawry), automatic payment verification, payouts, courier integration, native apps, buyer–seller chat, AI recommendations and visual search, virtual try-on, Meilisearch, seller ads, loyalty points, seller-created coupons, security deposits, fraud detection.

## 9. Before launch, the owner provides
Commission % and billing cycle · logo and brand assets · hero photography/video · legal pages reviewed by an Egyptian lawyer (terms, privacy, returns, seller agreement) · the platform's InstaPay account · domain · SMTP account (Resend works over SMTP) · R2 bucket.
