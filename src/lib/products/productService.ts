import { prisma } from "@/lib/prisma";
import { wooCommerceFetch, WooCommerceError } from "@/lib/woocommerce/client";
import { OP_BARCODE_META_KEY } from "@/lib/pos/opBarcode";
import type { Product } from "@prisma/client";

export type StockStatus = "instock" | "outofstock";

export interface ProductUpdateInput {
  name?: string;
  sku?: string | null;
  barcode?: string | null;
  price?: number;
  salePrice?: number | null;
  stockStatus?: StockStatus;
  stockQuantity?: number;
}

function serializeAdminProduct(p: Product) {
  return {
    id: p.id,
    wcId: p.wcId,
    name: p.name,
    sku: p.sku,
    barcode: p.barcode,
    price: p.price,
    salePrice: p.salePrice,
    stockQuantity: p.stockQuantity,
    stockStatus: p.stockStatus,
    imageUrl: p.imageUrl,
    isDeleted: p.isDeleted,
    isFavorite: p.isFavorite,
    updatedAt: p.updatedAt.toISOString(),
  };
}

function buildWooPayload(input: ProductUpdateInput): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  if (input.name !== undefined) body.name = input.name;
  if (input.sku !== undefined) body.sku = input.sku ?? "";
  if (input.price !== undefined) {
    body.regular_price = String(input.price);
  }
  if (input.salePrice !== undefined) {
    body.sale_price =
      input.salePrice == null ? "" : String(input.salePrice);
  }
  if (input.stockStatus !== undefined) {
    body.stock_status = input.stockStatus;
  }
  if (input.stockQuantity !== undefined) {
    body.manage_stock = true;
    body.stock_quantity = input.stockQuantity;
  }
  if (input.barcode !== undefined) {
    body.meta_data = [
      {
        key: OP_BARCODE_META_KEY,
        value: input.barcode ?? "",
      },
    ];
  }

  return body;
}

function assertSaleNotAboveRegular(
  regular: number,
  sale: number | null | undefined,
) {
  if (sale == null) return;
  if (sale > regular) {
    throw new ProductServiceError(
      "Sale price cannot be greater than the regular price",
      400,
    );
  }
}

/**
 * Update local Prisma product and mirror changes to WooCommerce via PUT.
 */
export async function updateProductAndSync(
  id: string,
  input: ProductUpdateInput,
): Promise<ReturnType<typeof serializeAdminProduct>> {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) {
    throw new ProductServiceError("Product not found", 404);
  }

  const data: {
    name?: string;
    sku?: string | null;
    barcode?: string | null;
    price?: number;
    salePrice?: number | null;
    stockStatus?: string;
    stockQuantity?: number;
  } = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new ProductServiceError("Name is required", 400);
    data.name = name;
  }
  if (input.sku !== undefined) {
    data.sku = input.sku?.trim() ? input.sku.trim() : null;
  }
  if (input.barcode !== undefined) {
    data.barcode = input.barcode?.trim() ? input.barcode.trim() : null;
  }
  if (input.price !== undefined) {
    if (!Number.isFinite(input.price) || input.price < 0) {
      throw new ProductServiceError("Invalid price", 400);
    }
    data.price = input.price;
  }
  if (input.salePrice !== undefined) {
    if (input.salePrice === null) {
      data.salePrice = null;
    } else {
      if (!Number.isFinite(input.salePrice) || input.salePrice < 0) {
        throw new ProductServiceError("Invalid sale price", 400);
      }
      // Treat 0 as clearing the sale
      data.salePrice = input.salePrice > 0 ? input.salePrice : null;
    }
  }
  if (input.stockStatus !== undefined) {
    if (input.stockStatus !== "instock" && input.stockStatus !== "outofstock") {
      throw new ProductServiceError("Invalid stock status", 400);
    }
    data.stockStatus = input.stockStatus;
  }
  if (input.stockQuantity !== undefined) {
    if (!Number.isFinite(input.stockQuantity) || input.stockQuantity < 0) {
      throw new ProductServiceError("Invalid stock quantity", 400);
    }
    data.stockQuantity = Math.floor(input.stockQuantity);
  }

  if (Object.keys(data).length === 0) {
    throw new ProductServiceError("No changes provided", 400);
  }

  const nextRegular = data.price ?? existing.price;
  const nextSale =
    data.salePrice !== undefined ? data.salePrice : existing.salePrice;
  assertSaleNotAboveRegular(nextRegular, nextSale);

  // Keep WooCommerce payload in sync with normalized sale (0 → clear)
  const wooInput: ProductUpdateInput = { ...input };
  if (data.salePrice !== undefined) {
    wooInput.salePrice = data.salePrice;
  }

  const wooBody = buildWooPayload(wooInput);
  if (Object.keys(wooBody).length > 0) {
    try {
      await wooCommerceFetch(`products/${existing.wcId}`, {
        method: "PUT",
        body: wooBody,
      });
    } catch (error) {
      if (error instanceof WooCommerceError) throw error;
      throw new ProductServiceError("Failed to update WooCommerce product", 502);
    }
  }

  const updated = await prisma.product.update({
    where: { id },
    data,
  });

  return serializeAdminProduct(updated);
}

/** Toggle favorite — local Prisma only (not synced to WooCommerce). */
export async function setProductFavorite(id: string, isFavorite: boolean) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) {
    throw new ProductServiceError("Product not found", 404);
  }
  const updated = await prisma.product.update({
    where: { id },
    data: { isFavorite },
  });
  return serializeAdminProduct(updated);
}

export async function softDeleteProduct(id: string) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) {
    throw new ProductServiceError("Product not found", 404);
  }
  if (existing.isDeleted) {
    return serializeAdminProduct(existing);
  }

  const updated = await prisma.product.update({
    where: { id },
    data: { isDeleted: true },
  });
  return serializeAdminProduct(updated);
}

export async function restoreProduct(id: string) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) {
    throw new ProductServiceError("Product not found", 404);
  }

  const updated = await prisma.product.update({
    where: { id },
    data: { isDeleted: false },
  });
  return serializeAdminProduct(updated);
}

export type PermanentDeleteScope = "erp" | "both";

/**
 * Hard-delete from Prisma. Optionally force-delete on WooCommerce first.
 */
export async function permanentlyDeleteProduct(
  id: string,
  scope: PermanentDeleteScope,
) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) {
    throw new ProductServiceError("Product not found", 404);
  }

  if (scope === "both") {
    try {
      await wooCommerceFetch(`products/${existing.wcId}`, {
        method: "DELETE",
        params: { force: true },
      });
    } catch (error) {
      if (
        !(error instanceof WooCommerceError) ||
        (error.statusCode !== 404 && error.statusCode !== 410)
      ) {
        throw error;
      }
    }
  }

  await prisma.product.delete({ where: { id } });
  return { ok: true as const, id, wcId: existing.wcId, scope };
}

export class ProductServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "ProductServiceError";
  }
}

/**
 * Increase local + WooCommerce stock for returned POS items (by WC product id).
 */
export async function restockProductsByWcId(
  items: { wcId: number; qty: number }[],
): Promise<{ wcId: number; stockQuantity: number }[]> {
  const results: { wcId: number; stockQuantity: number }[] = [];

  for (const item of items) {
    const qty = Math.floor(Math.abs(item.qty));
    if (!Number.isFinite(item.wcId) || item.wcId <= 0 || qty <= 0) {
      throw new ProductServiceError("Invalid restock line", 400);
    }

    const existing = await prisma.product.findUnique({
      where: { wcId: item.wcId },
    });
    if (!existing) {
      throw new ProductServiceError(
        `Product wcId ${item.wcId} not found in local catalog`,
        404,
      );
    }

    const nextQty = existing.stockQuantity + qty;
    const stockStatus = nextQty > 0 ? "instock" : existing.stockStatus;

    try {
      await wooCommerceFetch(`products/${existing.wcId}`, {
        method: "PUT",
        body: {
          manage_stock: true,
          stock_quantity: nextQty,
          stock_status: stockStatus,
        },
      });
    } catch (error) {
      if (error instanceof WooCommerceError) throw error;
      throw new ProductServiceError(
        `Failed to restock WooCommerce product ${existing.wcId}`,
        502,
      );
    }

    const updated = await prisma.product.update({
      where: { id: existing.id },
      data: { stockQuantity: nextQty, stockStatus },
    });

    results.push({ wcId: updated.wcId, stockQuantity: updated.stockQuantity });
  }

  return results;
}

export { serializeAdminProduct };
