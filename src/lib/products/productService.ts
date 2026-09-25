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
  linkedProductId?: string | null;
  bundleMultiplier?: number | null;
  categoryId?: string | null;
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
    purchasePackSize: p.purchasePackSize,
    imageUrl: p.imageUrl,
    isDeleted: p.isDeleted,
    isFavorite: p.isFavorite,
    linkedProductId: p.linkedProductId,
    bundleMultiplier: p.bundleMultiplier,
    categoryId: p.categoryId,
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
    linkedProductId?: string | null;
    bundleMultiplier?: number | null;
    categoryId?: string | null;
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

  // Virtual bundle link (null clears bundle mode)
  if (input.linkedProductId !== undefined) {
    const linkedRaw =
      input.linkedProductId == null
        ? ""
        : String(input.linkedProductId).trim();
    if (!linkedRaw) {
      data.linkedProductId = null;
      data.bundleMultiplier = null;
    } else {
      if (linkedRaw === id) {
        throw new ProductServiceError("A product cannot link to itself", 400);
      }
      const mult = Math.floor(
        Number(
          input.bundleMultiplier !== undefined
            ? input.bundleMultiplier
            : existing.bundleMultiplier,
        ),
      );
      if (!Number.isFinite(mult) || mult < 1) {
        throw new ProductServiceError(
          "Bundle multiplier must be a positive integer (e.g. 3)",
          400,
        );
      }
      const base = await prisma.product.findFirst({
        where: { id: linkedRaw, isDeleted: false },
        select: { id: true, linkedProductId: true },
      });
      if (!base) {
        throw new ProductServiceError("Linked base product not found", 404);
      }
      if (base.linkedProductId) {
        throw new ProductServiceError(
          "Cannot link a bundle to another virtual bundle — pick a single unit",
          400,
        );
      }
      data.linkedProductId = base.id;
      data.bundleMultiplier = mult;
      // Bundles do not hold inventory
      data.stockQuantity = 0;
      data.stockStatus = "instock";
    }
  } else if (input.bundleMultiplier !== undefined && existing.linkedProductId) {
    const mult = Math.floor(Number(input.bundleMultiplier));
    if (!Number.isFinite(mult) || mult < 1) {
      throw new ProductServiceError(
        "Bundle multiplier must be a positive integer (e.g. 3)",
        400,
      );
    }
    data.bundleMultiplier = mult;
  }

  if (input.categoryId !== undefined) {
    const categoryId = input.categoryId?.trim() ?? "";
    if (!categoryId) {
      data.categoryId = null;
    } else {
      const category = await prisma.category.findUnique({
        where: { id: categoryId },
        select: { id: true },
      });
      if (!category) throw new ProductServiceError("Category not found", 400);
      data.categoryId = category.id;
    }
  }

  if (Object.keys(data).length === 0) {
    throw new ProductServiceError("No changes provided", 400);
  }

  const nextRegular = data.price ?? existing.price;
  const nextSale =
    data.salePrice !== undefined ? data.salePrice : existing.salePrice;
  assertSaleNotAboveRegular(nextRegular, nextSale);

  const willBeBundle =
    data.linkedProductId !== undefined
      ? data.linkedProductId != null
      : Boolean(existing.linkedProductId);

  // Keep WooCommerce payload in sync with normalized sale (0 → clear)
  const wooInput: ProductUpdateInput = { ...input };
  if (data.salePrice !== undefined) {
    wooInput.salePrice = data.salePrice;
  }
  // Skip pushing stock for virtual bundles; disable WC stock management
  if (willBeBundle) {
    delete wooInput.stockQuantity;
    delete wooInput.stockStatus;
  }

  const wooBody = buildWooPayload(wooInput);
  if (willBeBundle) {
    wooBody.manage_stock = false;
    wooBody.stock_quantity = null;
  } else if (
    data.linkedProductId === null &&
    existing.linkedProductId != null
  ) {
    // Cleared bundle mode — re-enable stock management
    wooBody.manage_stock = true;
    if (data.stockQuantity !== undefined) {
      wooBody.stock_quantity = data.stockQuantity;
    }
  }

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
 * Virtual bundles restore stock on the linked base unit (qty × multiplier).
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

    const isBundle =
      Boolean(existing.linkedProductId) &&
      Number(existing.bundleMultiplier) > 0;

    let target = existing;
    let restoreQty = qty;

    if (isBundle) {
      const base = await prisma.product.findUnique({
        where: { id: existing.linkedProductId! },
      });
      if (!base) {
        throw new ProductServiceError(
          `Bundle "${existing.name}" is missing its base unit product`,
          404,
        );
      }
      target = base;
      restoreQty = qty * Math.floor(Number(existing.bundleMultiplier));
    }

    const nextQty = target.stockQuantity + restoreQty;
    const stockStatus = nextQty > 0 ? "instock" : target.stockStatus;

    try {
      await wooCommerceFetch(`products/${target.wcId}`, {
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
        `Failed to restock WooCommerce product ${target.wcId}`,
        502,
      );
    }

    const updated = await prisma.product.update({
      where: { id: target.id },
      data: { stockQuantity: nextQty, stockStatus },
    });

    results.push({ wcId: updated.wcId, stockQuantity: updated.stockQuantity });
  }

  return results;
}

export { serializeAdminProduct };
