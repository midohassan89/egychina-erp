import type { CachedProduct } from "@/types/woocommerce";
import { OP_BARCODE_META_KEY } from "@/lib/pos/opBarcode";
import { parsePrice, roundMoney } from "@/lib/pos/money";

/** Package row included with the POS catalog query. */
export interface PosPackageSource {
  id: string;
  barcode: string;
  name: string;
  nameEn: string | null;
  nameZh: string | null;
  packSize: number;
  price: number | null;
  isFavorite: boolean;
}

const PACKAGE_UNITS = ["كرتونة", "شرينك", "علبة", "كيس", "باكت"] as const;

/** Fields the POS mapper reads from a Prisma product row. */
export interface PosProductSource {
  id: string;
  wcId: number;
  name: string;
  nameEn: string | null;
  nameZh: string | null;
  sku: string | null;
  barcode: string | null;
  price: number;
  salePrice: number | null;
  stockQuantity: number;
  stockStatus: string;
  imageUrl: string | null;
  isFavorite: boolean;
  isWeighed: boolean;
  linkedProductId: string | null;
  bundleMultiplier: number | null;
  updatedAt: Date;
}

function packageUnitLabel(name: string): string {
  return PACKAGE_UNITS.find((unit) => name.includes(unit)) ?? "عبوة";
}

/**
 * Map a Prisma Product to the POS CachedProduct shape.
 * `id` is the WooCommerce ID so order sync still uses the correct product_id.
 * Barcode is exposed via meta_data `_op_barcode` for existing scan logic.
 */
export function prismaProductToCached(product: PosProductSource): CachedProduct {
  const now = product.updatedAt.toISOString();
  const price = String(product.price);
  const sale =
    product.salePrice != null && product.salePrice > 0
      ? String(product.salePrice)
      : "";
  const isBundle =
    Boolean(product.linkedProductId) &&
    Number(product.bundleMultiplier) > 0;
  const stockStatus =
    product.stockStatus === "outofstock" ? "outofstock" : "instock";

  return {
    id: product.wcId,
    name: product.name,
    nameEn: product.nameEn ?? null,
    nameZh: product.nameZh ?? null,
    slug: product.name.toLowerCase().replace(/\s+/g, "-"),
    sku: product.sku ?? "",
    price,
    regular_price: price,
    sale_price: sale,
    on_sale: Boolean(sale),
    stock_quantity: product.stockQuantity,
    stock_status: stockStatus,
    // Virtual bundles do not manage their own stock
    manage_stock: !isBundle,
    categories: [],
    images: product.imageUrl
      ? [
          {
            id: 0,
            src: product.imageUrl,
            name: product.name,
            alt: product.name,
          },
        ]
      : [],
    description: "",
    short_description: "",
    status: "publish",
    type: "simple",
    meta_data: product.barcode
      ? [{ key: OP_BARCODE_META_KEY, value: product.barcode }]
      : [],
    cachedAt: now,
    isFavorite: product.isFavorite,
    isWeighed: product.isWeighed,
    prismaId: product.id,
    posKey: product.id,
    linkedProductId: product.linkedProductId,
    bundleMultiplier: product.bundleMultiplier,
  };
}

/**
 * One sellable POS card per additional package.
 * `id` stays the parent WooCommerce id so sales, stock, and returns
 * still resolve the base product. `posKey` keeps the card and cart line distinct.
 */
export function packageToPosItem(
  product: PosProductSource,
  pkg: PosPackageSource,
  index = 0,
): CachedProduct {
  const base = prismaProductToCached(product);
  const itemsCount = Math.max(1, Math.floor(Number(pkg.packSize)) || 1);
  const explicit =
    pkg.price != null && Number.isFinite(pkg.price) ? pkg.price : null;
  const amount =
    explicit != null
      ? explicit
      : roundMoney(parsePrice(product.price) * itemsCount);
  const price = String(amount);
  const storedName = pkg.name?.trim() ?? "";
  const name = storedName || `${product.name} - كرتونة`;
  const barcode = pkg.barcode?.trim() ?? "";

  return {
    ...base,
    posKey: `${product.id}-pkg-${pkg.id || index}`,
    parentId: product.id,
    isPackage: true,
    isFavorite: pkg.isFavorite === true,
    isWeighed: false,
    name,
    nameEn: pkg.nameEn?.trim() || product.nameEn,
    nameZh: pkg.nameZh?.trim() || product.nameZh,
    sku: "",
    price,
    regular_price: price,
    sale_price: "",
    on_sale: false,
    manage_stock: false,
    linkedProductId: null,
    bundleMultiplier: null,
    itemsCount,
    unit: packageUnitLabel(storedName),
    meta_data: barcode
      ? [{ key: OP_BARCODE_META_KEY, value: barcode }]
      : [],
  };
}

/** Base product plus one virtual POS item for every additional package. */
export function expandPosCatalog(
  product: PosProductSource,
  packages: PosPackageSource[] = [],
): CachedProduct[] {
  const base = prismaProductToCached(product);
  const extras = packages.map((pkg, index) =>
    packageToPosItem(product, pkg, index),
  );
  return [base, ...extras];
}
