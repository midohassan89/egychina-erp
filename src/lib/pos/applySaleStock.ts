import { prisma } from "@/lib/prisma";
import { wooCommerceFetch, WooCommerceError } from "@/lib/woocommerce/client";

export class SaleStockError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
  ) {
    super(message);
    this.name = "SaleStockError";
  }
}

export interface SaleStockLineInput {
  /** WooCommerce product id from the POS cart line. */
  wcProductId: number | null | undefined;
  quantity: number;
}

type ProductStockRow = {
  id: string;
  wcId: number;
  name: string;
  stockQuantity: number;
  stockStatus: string;
  linkedProductId: string | null;
  bundleMultiplier: number | null;
};

/**
 * Apply inventory impact for a completed POS sale.
 *
 * Virtual bundles: cart/receipt keep the bundle product, but stock is deducted
 * ONLY from the linked base unit (qty × bundleMultiplier).
 * Regular products: deduct from themselves (Prisma only — WooCommerce stock for
 * those lines is handled by the completed WC order).
 *
 * Bundle base-unit stock is also synced to WooCommerce here, because the WC
 * order line is the virtual bundle (manage_stock=false).
 */
export async function applySaleStockChanges(options: {
  lines: SaleStockLineInput[];
}): Promise<{
  updated: { productId: string; wcId: number; stockQuantity: number }[];
  wooSynced: number;
  wooError: string | null;
}> {
  const deltaByProductId = new Map<string, number>();
  /** Product ids whose WC stock must be updated (bundle base units). */
  const wooSyncIds = new Set<string>();
  const productCache = new Map<string, ProductStockRow>();

  async function loadProduct(where: {
    id?: string;
    wcId?: number;
  }): Promise<ProductStockRow | null> {
    const cached = [...productCache.values()].find((p) =>
      where.id ? p.id === where.id : p.wcId === where.wcId,
    );
    if (cached) return cached;

    const row = await prisma.product.findFirst({
      where: {
        isDeleted: false,
        ...(where.id ? { id: where.id } : {}),
        ...(where.wcId != null ? { wcId: where.wcId } : {}),
      },
      select: {
        id: true,
        wcId: true,
        name: true,
        stockQuantity: true,
        stockStatus: true,
        linkedProductId: true,
        bundleMultiplier: true,
      },
    });
    if (!row) return null;
    productCache.set(row.id, row);
    return row;
  }

  for (const line of options.lines) {
    const qty = Math.floor(Math.abs(Number(line.quantity) || 0));
    if (qty <= 0) continue;
    const wcId = Number(line.wcProductId);
    if (!Number.isFinite(wcId) || wcId <= 0) continue;

    const product = await loadProduct({ wcId });
    if (!product) continue;

    const isBundle =
      Boolean(product.linkedProductId) &&
      Number(product.bundleMultiplier) > 0;

    if (isBundle) {
      const base = await loadProduct({ id: product.linkedProductId! });
      if (!base) {
        throw new SaleStockError(
          `Bundle "${product.name}" is missing its base unit product`,
          400,
        );
      }
      const units = qty * Math.floor(Number(product.bundleMultiplier));
      deltaByProductId.set(
        base.id,
        (deltaByProductId.get(base.id) ?? 0) - units,
      );
      wooSyncIds.add(base.id);
    } else {
      deltaByProductId.set(
        product.id,
        (deltaByProductId.get(product.id) ?? 0) - qty,
      );
    }
  }

  for (const [productId, delta] of deltaByProductId) {
    if (delta >= 0) continue;
    const product =
      productCache.get(productId) ?? (await loadProduct({ id: productId }));
    if (!product) {
      throw new SaleStockError(
        `Product ${productId} not found for stock update`,
        404,
      );
    }
    // Overselling is allowed: stock may go to 0 or negative.
  }

  const updated: { productId: string; wcId: number; stockQuantity: number }[] =
    [];

  await prisma.$transaction(async (tx) => {
    for (const [productId, delta] of deltaByProductId) {
      if (delta === 0) continue;
      const current =
        productCache.get(productId) ??
        (await tx.product.findUnique({
          where: { id: productId },
          select: {
            id: true,
            wcId: true,
            name: true,
            stockQuantity: true,
            stockStatus: true,
            linkedProductId: true,
            bundleMultiplier: true,
          },
        }));
      if (!current) {
        throw new SaleStockError(`Product ${productId} not found`, 404);
      }

      const nextQty = current.stockQuantity + delta;
      const stockStatus =
        nextQty > 0
          ? "instock"
          : nextQty === 0
            ? "outofstock"
            : current.stockStatus;

      const row = await tx.product.update({
        where: { id: productId },
        data: { stockQuantity: nextQty, stockStatus },
        select: { id: true, wcId: true, stockQuantity: true },
      });
      updated.push({
        productId: row.id,
        wcId: row.wcId,
        stockQuantity: row.stockQuantity,
      });
    }
  });

  let wooSynced = 0;
  let wooError: string | null = null;

  for (const row of updated) {
    if (!wooSyncIds.has(row.productId)) continue;
    try {
      await wooCommerceFetch(`products/${row.wcId}`, {
        method: "PUT",
        body: {
          manage_stock: true,
          stock_quantity: row.stockQuantity,
          stock_status: row.stockQuantity > 0 ? "instock" : "outofstock",
        },
      });
      wooSynced += 1;
    } catch (error) {
      wooError =
        error instanceof WooCommerceError
          ? error.message
          : "WooCommerce stock sync failed";
      break;
    }
  }

  return { updated, wooSynced, wooError };
}
