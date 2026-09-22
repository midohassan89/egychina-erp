import type { Product } from "@prisma/client";
import type { CachedProduct } from "@/types/woocommerce";
import { OP_BARCODE_META_KEY } from "@/lib/pos/opBarcode";

/**
 * Map a Prisma Product to the POS CachedProduct shape.
 * `id` is the WooCommerce ID so order sync still uses the correct product_id.
 * Barcode is exposed via meta_data `_op_barcode` for existing scan logic.
 */
export function prismaProductToCached(product: Product): CachedProduct {
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
    prismaId: product.id,
    linkedProductId: product.linkedProductId,
    bundleMultiplier: product.bundleMultiplier,
  };
}
