# Souq El Obour ERP — Project Summary

Supermarket ERP and point of sale for Souq El Obour (`supermarket-pos` 0.1.0). The Next.js app is the system of record (SQLite via Prisma). A separate storefront and a driver app talk to this backend. Product names and the dashboard are Arabic, RTL.

`node_modules/`, `.next/`, and the SQLite file `prisma/dev.db` are omitted from the tree below.

## 1. Tech stack

| Layer | Choice |
| --- | --- |
| App | Next.js 15 App Router (`next` ^15.1.3), React 19, TypeScript 5.7 (`strict`) |
| Styling | Tailwind CSS 3.4, PostCSS, `clsx`, Lucide icons |
| Data | Prisma 6.19, SQLite (`DATABASE_URL=file:./dev.db`) |
| Auth | NextAuth.js v5 beta (Auth.js), credentials, `bcryptjs` |
| HTTP / HTML | `axios`, `axios-cookiejar-support`, `tough-cookie`, `cheerio` |
| Images | `sharp` (server), `browser-image-compression` (client) |
| POS hardware UX | `html5-qrcode`, `react-barcode`, `react-simple-keyboard` |
| Offline POS | `idb` (IndexedDB catalog and sale queue) |
| Spreadsheets | `xlsx` |
| Charts | `recharts` |
| Translation | `@vitalets/google-translate-api`, `google-translate-api-x` |
| Push | `firebase-admin`, Expo push helper in `src/lib/push/expo.ts` |
| IDs | `uuid` plus Prisma `cuid()` / `autoincrement()` |
| Lint | ESLint 9 + `eslint-config-next` |
| Scripts | `tsx` for seed and one-off scripts |

Scripts: `dev`, `build` (`prisma generate && next build`), `start`, `lint`, `db:generate`, `db:push`, `db:seed`, `db:setup`.

There is no Flutter (`pubspec.yaml`) or PHP (`composer.json`) project in this workspace.

Path alias: `@/*` → `src/*` (`tsconfig.json`).

## 2. Folder and file structure

Root (source and config only):

```text
ERP/
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── dev.db                  # local SQLite, not source
├── scripts/
│   └── migrate-bundles.ts
├── src/                        # application (full tree below)
├── public/uploads/products/    # compressed product images
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── tailwind.config.ts
├── tsconfig.json
├── README.md
└── .env.example
```

`next.config.ts` only enables `reactStrictMode`. Empty directories that have no route file yet: `src/app/admin/auto-images/`, `src/app/admin/cleanup-packages/`, `src/app/admin/fetch-image/`, `src/lib/wordpress/`.

```text
src/
├── app/
│   ├── accounting/page.tsx
│   ├── admin/
│   │   ├── auto-translate/AutoTranslateList.tsx
│   │   ├── auto-translate/page.tsx
│   │   ├── brands/page.tsx
│   │   ├── delivery-zones/page.tsx
│   │   ├── orders/page.tsx
│   │   └── layout.tsx
│   ├── api/                    # 106 route modules; see section 3
│   ├── customers/page.tsx
│   ├── dashboard/
│   │   ├── audit/page.tsx
│   │   ├── categories/page.tsx
│   │   ├── customers/layout.tsx
│   │   ├── customers/page.tsx
│   │   ├── employees/[id]/page.tsx
│   │   ├── employees/page.tsx
│   │   ├── expenses/page.tsx
│   │   ├── fleet/page.tsx
│   │   ├── inventory/adjustments/new/page.tsx
│   │   ├── inventory/adjustments/page.tsx
│   │   ├── inventory/opening-balance/[id]/edit/page.tsx
│   │   ├── inventory/opening-balance/page.tsx
│   │   ├── inventory/print-labels/page.tsx
│   │   ├── inventory/stock-take/page.tsx
│   │   ├── inventory/page.tsx
│   │   ├── products/[id]/page.tsx
│   │   ├── products/new/page.tsx
│   │   ├── products/page.tsx
│   │   ├── profile/page.tsx
│   │   ├── purchases/edit/[id]/page.tsx
│   │   ├── purchases/edit/layout.tsx
│   │   ├── purchases/new/page.tsx
│   │   ├── purchases/returns/page.tsx
│   │   ├── purchases/page.tsx
│   │   ├── reports/supplier-statement/page.tsx
│   │   ├── reports/page.tsx
│   │   ├── returns/layout.tsx
│   │   ├── returns/page.tsx
│   │   ├── sales/page.tsx
│   │   ├── settings/layout.tsx
│   │   ├── settings/page.tsx
│   │   ├── shifts/page.tsx
│   │   ├── suppliers/page.tsx
│   │   ├── tools/auto-fetch/AutoFetchPanel.tsx
│   │   ├── tools/auto-fetch/layout.tsx
│   │   ├── tools/auto-fetch/page.tsx
│   │   ├── treasury/page.tsx
│   │   ├── users/logs/layout.tsx
│   │   ├── users/logs/page.tsx
│   │   ├── users/layout.tsx
│   │   ├── users/page.tsx
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── login/LoginForm.tsx
│   ├── login/page.tsx
│   ├── pos/page.tsx
│   ├── price-checker/layout.tsx
│   ├── price-checker/page.tsx
│   ├── print/order/[id]/page.tsx
│   ├── products/page.tsx
│   ├── reports/page.tsx
│   ├── settings/page.tsx
│   ├── uploads/[...slug]/route.ts
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── dashboard/              # selects, product modals, orders, HR, opening balance
│   ├── layout/                 # AppShell, DashboardShell, Header, Sidebar
│   ├── pos/                    # grid, cart, checkout, shift, receipt, keyboard
│   ├── pricing/MarginPills.tsx
│   ├── products/ProductForm.tsx
│   ├── providers/AuthProvider.tsx
│   ├── purchases/              # PurchaseForm, line editor, yield, package hint
│   └── ui/                     # Toast, ImagePicker, SafeImage
├── hooks/                      # cart, catalog sync, checkout, offline, shift, images
├── lib/                        # domain services (see architecture)
├── types/                      # admin product, POS, WooCommerce, NextAuth
├── auth.config.ts
├── auth.ts
└── middleware.ts
```

`src/lib/` domains: `audit`, `auth`, `cache`, `driver`, `hr`, `images`, `inventory`, `loyalty`, `orders`, `pos`, `products`, `purchases`, `push`, `reports`, `shifts`, `store`, `suppliers`, `treasury`, `woocommerce`, plus `prisma.ts` and `firebase-admin.ts`.

## 3. Database and API

SQLite. Prisma client is a singleton: `import { prisma } from "@/lib/prisma"`. SQLite does not support Prisma `mode: "insensitive"`.

### Enums

- `Role`: `CASHIER`, `ACCOUNTANT`, `MANAGER`, `ADMIN`, `DRIVER`
- `OrderStatus`: `PENDING`, `CONFIRMED`, `PREPARING`, `SHIPPED`, `DELIVERED`, `COMPLETED`, `PARTIALLY_RETURNED`, `RETURNED`, `CANCELLED`
- `ReturnStatus`: `PENDING`, `CONFIRMED`, `COLLECTING`, `COMPLETED`, `CANCELLED`
- `EmployeeTransactionType`: `ADVANCE`, `DEDUCTION`, `BONUS`, `SALARY_PAYMENT`

### Models

| Model | Role |
| --- | --- |
| `User` | Staff login. Username, password hash, optional PIN, role, `ACTIVE` / `SUSPENDED`. |
| `AuditLog` | Who did what (`action`, `entity`, `entityId`, `details`). |
| `Product` | Catalog. `wcId` is the WooCommerce id. Prices, stock, barcode, `purchasePackSize`, `buyingCost`, image, favorite, active, soft-delete, optional category/brand, virtual bundle link. |
| `ProductPackage` | Extra sellable barcode (carton, shrink, and so on). `packSize`, optional `price` (null means unit price × pack size). |
| `Category`, `Brand` | Arabic name plus English and Chinese. Category has a unique slug. |
| `Supplier` | Name, phone, live accounts-payable `balance`, opening balance. |
| `PurchaseInvoice`, `PurchaseInvoiceItem` | Supplier invoice. Item quantity is pieces; `unitCost` is piece cost. Status `PAID` / `PARTIAL` / `UNPAID`. |
| `PurchaseReturn`, `PurchaseReturnItem` | Supplier returns. |
| `SupplierPayment` | Payment from treasury or a bank account. |
| `Treasury` | Singleton cash safe, `id = 1`. |
| `TreasuryTransaction` | `IN` / `OUT` with a reference (`EXPENSE`, `SUPPLIER_PAY`, `POS_SHIFT`, …). |
| `BankAccount`, `BankTransaction` | Visa, wallet, InstaPay, WeChat. Stable `code`. |
| `InternalTransfer` | Treasury ↔ bank or bank ↔ bank. |
| `ExpenseCategory`, `Expense` | Operating expenses, paid from treasury or a bank account. |
| `Shift` | POS shift. Starting cash, sales by tender, tickets, actual cash, variance, `OPEN` / `CLOSED`. |
| `InventoryAdjustment`, `AdjustmentItem` | Wastage, loss, production use, manual count. |
| `OpeningBalance`, `OpeningBalanceItem` | Opening stock: packs, pack size, loose pieces, piece cost. |
| `Employee`, `EmployeeTransaction` | Payroll and staff meals. Not a login account. |
| `Sale`, `SaleLine` | Completed POS ticket. Idempotent `localId`. Payment method, optional staff meal, audit flag, cost snapshot. |
| `Customer` | Store customer by phone. Points, Expo and FCM tokens, optional password. |
| `Address`, `CustomerAddress`, `DeliveryZone` | Delivery addresses and fees. `Address` is the shared app/website model. |
| `StoreSetting` | Key/value storefront settings (loyalty ratios). |
| `PointsTransaction` | `EARN` / `REDEEM`. |
| `Order`, `OrderItem` | Storefront orders. |
| `ReturnRequest`, `ReturnItem` | Customer returns against an order. |
| `DriverExpense` | Fuel, toll, oil, maintenance. Photos, approval status, link to `Expense`. |

### Screens

| Path | Purpose |
| --- | --- |
| `/` | Sends a signed-in user to their home (`/pos` or `/dashboard`). |
| `/login` | Staff login. |
| `/pos` | Cashier. Catalog, cart, checkout, shift, receipt. |
| `/price-checker` | Public barcode price display. |
| `/print/order/[id]` | Order print view. |
| `/dashboard` | Overview. |
| `/dashboard/products`, `/new`, `/[id]` | Catalog, create, product card. |
| `/dashboard/categories` | Departments. |
| `/dashboard/purchases`, `/new`, `/edit/[id]`, `/returns` | Supplier invoices. Create and edit share `PurchaseForm`. |
| `/dashboard/suppliers` | Suppliers and balances. |
| `/dashboard/sales` | POS sales. |
| `/dashboard/inventory` and nested stock-take, adjustments, opening balance, print labels | Stock. |
| `/dashboard/expenses` | Expenses. |
| `/dashboard/treasury` | Cash safe and banks. |
| `/dashboard/reports`, `/supplier-statement` | P&L and supplier statement. |
| `/dashboard/shifts` | Shifts. |
| `/dashboard/audit` | Sales that need review. |
| `/dashboard/users`, `/logs` | Staff and audit log. |
| `/dashboard/employees`, `/[id]` | HR / staff meals. |
| `/dashboard/customers` | Store customers and points. |
| `/dashboard/returns` | Customer return requests. |
| `/dashboard/fleet` | Driver expenses. |
| `/dashboard/settings`, `/profile` | Settings and profile. |
| `/dashboard/tools/auto-fetch` | Bulk product image fetch. |
| `/admin/orders`, `/admin/brands`, `/admin/delivery-zones`, `/admin/auto-translate` | Manager/admin tools. |
| `/accounting`, `/reports`, `/settings`, `/products`, `/customers` | Older or alternate entry routes. Cashiers are redirected away from these to `/pos`. |

### API endpoints

Unless listed as public below, `/api/*` requires a signed-in staff session. Unsigned calls get JSON `401`, not an HTML redirect. Drivers may only call `/api/driver/*`.

NextAuth: `GET` and `POST` `/api/auth/[...nextauth]` (handlers re-exported, not written as `export async function`).

| Method | Path |
| --- | --- |
| POST | `/api/auth/login` |
| POST | `/api/auth/verify-pin` |
| GET, POST | `/api/users` |
| DELETE | `/api/users/[id]` |
| PATCH | `/api/users/[id]/toggle-status` |
| GET | `/api/users/audit-logs` |
| POST | `/api/users/change-password` |
| POST | `/api/users/verify-pin` |
| GET, POST | `/api/products` |
| POST | `/api/products/create` |
| PATCH, DELETE | `/api/products/[id]` |
| PATCH | `/api/products/[id]/status` |
| PATCH | `/api/products/[id]/purchase-price` |
| GET | `/api/products/[id]/ledger` |
| GET | `/api/products/search` |
| GET | `/api/products/check-barcode` |
| GET | `/api/products/linked-virtual` |
| POST | `/api/products/quick-update-price` |
| POST | `/api/products/quick-update-pack-size` |
| POST | `/api/products/bulk-update` |
| POST | `/api/products/bulk-update-prices` |
| POST | `/api/products/import-prices` |
| GET, POST | `/api/categories` |
| PUT, DELETE | `/api/categories/[id]` |
| GET, POST | `/api/admin/brands` |
| PUT, DELETE | `/api/admin/brands/[id]` |
| POST | `/api/admin/products/import` |
| POST | `/api/admin/translate-text` |
| POST | `/api/admin/auto-translate` |
| GET | `/api/admin/categorize-products` |
| GET | `/api/admin/customers/search` |
| POST | `/api/admin/upload` |
| POST | `/api/admin/upload-image` |
| GET | `/api/admin/migrate-images` |
| PATCH | `/api/admin/orders/[id]` |
| GET | `/api/purchases` |
| POST | `/api/purchases/create` |
| GET, PATCH | `/api/purchases/[id]` |
| POST | `/api/purchases/[id]/settle` |
| GET | `/api/purchases/returns` |
| POST | `/api/purchases/returns/create` |
| GET, POST | `/api/suppliers` |
| GET, PATCH | `/api/suppliers/[id]` |
| POST | `/api/suppliers/pay` |
| POST | `/api/checkout` |
| POST | `/api/pos/restock` |
| GET | `/api/shifts` |
| GET | `/api/shifts/current` |
| POST | `/api/shifts/open` |
| POST | `/api/shifts/close` |
| GET, POST | `/api/sales/audit` |
| GET | `/api/orders/history` |
| GET | `/api/reports/summary` |
| GET | `/api/reports/products` |
| GET | `/api/reports/inventory-valuation` |
| GET | `/api/reports/supplier-statement` |
| GET | `/api/treasury` |
| POST | `/api/treasury/deposit` |
| POST | `/api/treasury/withdraw` |
| POST | `/api/treasury/transfer` |
| GET | `/api/bank-accounts` |
| GET | `/api/expenses` |
| POST | `/api/expenses/create` |
| GET, POST | `/api/expenses/categories` |
| POST | `/api/inventory/adjust` |
| GET | `/api/inventory/adjustments` |
| POST | `/api/inventory/opening-balance` |
| GET, PUT | `/api/opening-balances/[id]` |
| GET | `/api/inventory/stock-take/products` |
| POST | `/api/inventory/stock-take/complete` |
| GET | `/api/inventory/unit-cost` |
| GET, POST, PATCH | `/api/employees` |
| GET | `/api/employees/[id]` |
| POST | `/api/employees/[id]/transactions` |
| GET | `/api/customers` |
| PATCH | `/api/customers/[id]/points` |
| GET | `/api/customers/[id]/orders` |
| GET, POST, PUT, DELETE | `/api/customers/[id]/addresses` |
| GET, POST | `/api/customer/addresses` |
| POST | `/api/customer/push-token` |
| GET, POST, PUT, DELETE | `/api/delivery-zones` |
| GET, PUT | `/api/settings` |
| POST | `/api/returns` |
| PATCH | `/api/returns/[id]` |
| GET | `/api/store/products` |
| GET | `/api/store/categories` |
| GET | `/api/store/brands` |
| GET, POST | `/api/store/orders` |
| PATCH | `/api/store/orders/[id]` |
| POST, PUT | `/api/store/customer/token` |
| POST | `/api/store/push-token` |
| POST | `/api/driver/login` |
| GET, POST | `/api/driver/expenses` |
| POST | `/api/driver/upload` |
| GET | `/api/admin/fleet/expenses` |
| PATCH | `/api/admin/fleet/expenses/[id]` |
| GET | `/api/price-checker/lookup` |
| GET | `/api/external/barcode-lookup` |
| POST | `/api/upload/auto-fetch` |
| POST | `/api/sync/pull-from-wc` |
| GET | `/api/woocommerce/products` |
| GET | `/api/woocommerce/categories` |
| GET | `/api/woocommerce/customers` |
| POST | `/api/woocommerce/orders` |
| GET | `/api/woocommerce/sync` |
| GET | `/uploads/[...slug]` |

Public or separately authenticated (middleware lets them through; handlers enforce their own checks): `/api/auth/*`, `/api/price-checker`, `/api/store/*`, `/api/customer/*`, `/api/driver/*`, `GET /api/settings`, `GET /api/delivery-zones`, customer address/order routes, `POST /api/returns`. Storefront calls use `x-api-key` (`STORE_API_KEY`) via `src/lib/store/storeAuth.ts`. Driver routes use a bearer token from `/api/driver/login`.

Create purchase is `POST /api/purchases/create`. Update is `PATCH /api/purchases/[id]`. `GET /api/purchases` is the list only.

## 4. Patterns and architecture

**Layers.** Pages live in `src/app`. Shared UI lives in `src/components`. Domain rules live in `src/lib` and are called from route handlers. A route file exports only HTTP methods and segment config. Do not re-export helpers from `route.ts`.

**UI.** Dashboard shell is `dir="rtl"`. Most dashboard and POS screens are client components with `useState`. `ProductForm` and `PurchaseForm` do not use react-hook-form. Feedback uses `ToastProvider` / `useToast()` (`success`, `error`, `info`). Money display goes through `formatEGP` / `roundMoney` in `src/lib/pos/money.ts`.

**Auth.** Roles are checked with `isAdmin`, `isEditor` (manager, accountant, or admin), `canManageUsers`, and `canUsePos` in `src/lib/auth/roles.ts`. Cashiers land on `/pos` and cannot open the dashboard. Drivers have no web home. Editing a purchase invoice is admin-only (`purchases/edit/layout.tsx`).

**Catalog.** `Product.id` is a cuid. `Product.wcId` is the WooCommerce integer and is what POS order sync still sends. Names are Arabic, with optional `nameEn` and `nameZh`. Barcode lookup tries DuckDuckGo HTML first, then Open Food Facts. Translation is a manual button, plus a save-time safety net when both English and Chinese are empty. Package selling price is entered by hand. A null package price means POS uses the active unit price times `packSize`.

**Purchases.** One `PurchaseForm` covers create and edit. Create posts to `/api/purchases/create`. Edit patches `/api/purchases/[id]` when `initialData.id` is set. The item payload is `{ productId, quantity: pieces, unitCost: piece cost, resetPackages }`. New invoices keep a `localStorage` draft (`draft_purchase_order`). Edit mode does not read or write that draft. Stock, supplier balance, and treasury movement run inside the purchase service transaction.

**POS.** The grid reads an IndexedDB catalog (`src/lib/cache/indexeddb.ts`) and syncs from the server. Checkout posts `/api/checkout`. Sales can queue offline and retry. Scale barcodes encode weight. Payment methods: cash, visa, wallet, instapay, wechat, and staff meal. Loyalty defaults are 10 points per 1 EGP earned and 1000 points per 1 EGP redeemed (`src/lib/loyalty/settings.ts`); storefront settings can override those defaults. A shift must be open; closing posts a Z report into the treasury.

**Images.** Uploaded files are WebP under `public/uploads/products/` and stored as `/uploads/...`. `SafeImage` percent-encodes non-ASCII URLs, rewrites a stored `localhost` uploads URL to a root-relative `/uploads/...` path, skips the Next.js image optimizer, and falls back to `/placeholder.png` on error.

**Money movement.** Treasury is the cash safe. Bank accounts are the electronic tenders. Expenses, supplier payments, and shift close all go through the treasury/bank helpers so balances stay in one transaction.

**Conventions.** Prefer extending an existing form or service over duplicating a page. Keep API JSON shapes stable when a screen is refactored. Do not run `prisma db push` against the storefront schema from this app. Do not print or commit secrets from `.env`.
