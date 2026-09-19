# Supermarket POS

A modern web-based Point of Sale (POS) and accounting system for supermarkets, integrated with a WooCommerce backend.

## Stack

- **Next.js 15** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **IndexedDB** (via `idb`) for offline product catalog caching

## Getting Started

### Prerequisites

- Node.js 18+
- A WooCommerce store with REST API keys

### Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template and add your WooCommerce credentials:

   ```bash
   cp .env.example .env.local
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) and click **Sync Catalog** to download products for offline use.

## Project Structure

```
src/
├── app/                    # Next.js App Router pages & API routes
│   ├── api/woocommerce/    # Server-side WooCommerce proxy endpoints
│   ├── pos/                # Point of Sale terminal
│   ├── products/           # Product catalog view
│   └── ...
├── components/layout/      # Shell, sidebar, header (with Sync button)
├── hooks/                  # useCatalogSync — offline/online catalog state
├── lib/
│   ├── cache/              # IndexedDB catalog storage
│   └── woocommerce/        # WooCommerce REST API client (server-only)
└── types/                  # Shared TypeScript interfaces
```

## WooCommerce Integration

Credentials never leave the server. Client components call Next.js API routes which authenticate with WooCommerce using HTTP Basic Auth:

| Endpoint | Description |
|---|---|
| `GET /api/woocommerce/products` | Fetch all published products |
| `GET /api/woocommerce/categories` | Fetch product categories |
| `GET /api/woocommerce/customers` | Fetch customers |
| `GET /api/woocommerce/sync` | Fetch products + categories for local cache |

## Offline Catalog

Products and categories are stored in IndexedDB after a manual sync. The POS terminal loads instantly from the local cache and works offline. Use the **Sync Catalog** button in the header to refresh from WooCommerce when online.

## License

Private — all rights reserved.
