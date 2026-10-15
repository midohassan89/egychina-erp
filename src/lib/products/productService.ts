import { prisma } from "@/lib/prisma";
import type { Product, ProductPackage } from "@prisma/client";
import {
  assertPackageBarcodesFree,
  normalizeProductPackages,
  packageUniqueMessage,
  PackageInputError,
} from "@/lib/products/packages";

export type StockStatus = "instock" | "outofstock";

export interface ProductUpdateInput {
  name?: string;
  nameEn?: string | null;
  nameZh?: string | null;
  sku?: string | null;
  barcode?: string | null;
  price?: number;
  salePrice?: number | null;
  stockStatus?: StockStatus;
  stockQuantity?: number;
  categoryId?: string | null;
  brandId?: string | null;
  imageUrl?: string | null;
  isWeighed?: boolean;
  /** When present, replaces the product's packages. */
  packages?: unknown;
}

function serializePackages(packages: ProductPackage[]) {
  return packages.map((row) => ({
    id: row.id,
    barcode: row.barcode,
    name: row.name,
    nameEn: row.nameEn,
    nameZh: row.nameZh,
    packSize: row.packSize,
    price: row.price,
  }));
}

function serializeAdminProduct(p: Product, packages?: ProductPackage[]) {
  return {
    id: p.id,
    wcId: p.wcId,
    name: p.name,
    nameEn: p.nameEn,
    nameZh: p.nameZh,
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
    isWeighed: p.isWeighed,
    linkedProductId: p.linkedProductId,
    bundleMultiplier: p.bundleMultiplier,
    categoryId: p.categoryId,
    brandId: p.brandId,
    categoryName: null,
    brandName: null,
    updatedAt: p.updatedAt.toISOString(),
    ...(packages ? { packages: serializePackages(packages) } : {}),
  };
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
 * Update a product in the local ERP database.
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
    nameEn?: string | null;
    nameZh?: string | null;
    sku?: string | null;
    barcode?: string | null;
    price?: number;
    salePrice?: number | null;
    stockStatus?: string;
    stockQuantity?: number;
    categoryId?: string | null;
    brandId?: string | null;
    imageUrl?: string | null;
    isWeighed?: boolean;
  } = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new ProductServiceError("Name is required", 400);
    data.name = name;
  }
  if (input.nameEn !== undefined) {
    data.nameEn = input.nameEn?.trim() || null;
  }
  if (input.nameZh !== undefined) {
    data.nameZh = input.nameZh?.trim() || null;
  }
  if (input.sku !== undefined) {
    data.sku = input.sku?.trim() ? input.sku.trim() : null;
  }
  if (input.barcode !== undefined) {
    data.barcode = input.barcode?.trim() ? input.barcode.trim() : null;
  }
  if (input.isWeighed !== undefined) {
    data.isWeighed = Boolean(input.isWeighed);
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
    data.stockQuantity = Math.round(input.stockQuantity * 1000) / 1000;
  }

  if (input.imageUrl !== undefined) {
    const imageUrl = input.imageUrl?.trim() ?? "";
    if (!imageUrl) {
      data.imageUrl = null;
    } else if (
      imageUrl.startsWith("/uploads/products/") &&
      !imageUrl.includes("..")
    ) {
      data.imageUrl = imageUrl;
    } else if (imageUrl === existing.imageUrl) {
      data.imageUrl = existing.imageUrl;
    } else {
      throw new ProductServiceError("Image must be a local upload path", 400);
    }
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

  if (input.brandId !== undefined) {
    const brandId = input.brandId?.trim() ?? "";
    if (!brandId) {
      data.brandId = null;
    } else {
      const brand = await prisma.brand.findUnique({
        where: { id: brandId },
        select: { id: true },
      });
      if (!brand) throw new ProductServiceError("Brand not found", 400);
      data.brandId = brand.id;
    }
  }

  let packageWrites: ReturnType<typeof normalizeProductPackages> | undefined;
  if (input.packages !== undefined) {
    try {
      packageWrites = normalizeProductPackages(input.packages);
      const nextBarcode =
        data.barcode !== undefined ? data.barcode : existing.barcode;
      await assertPackageBarcodesFree(packageWrites, {
        productId: id,
        productBarcode: nextBarcode,
      });
    } catch (error) {
      if (error instanceof PackageInputError) {
        throw new ProductServiceError(error.message, 400);
      }
      throw error;
    }
  }

  if (Object.keys(data).length === 0 && packageWrites === undefined) {
    throw new ProductServiceError("No changes provided", 400);
  }

  const nextRegular = data.price ?? existing.price;
  const nextSale =
    data.salePrice !== undefined ? data.salePrice : existing.salePrice;
  assertSaleNotAboveRegular(nextRegular, nextSale);

  try {
    const updated = await prisma.product.update({
      where: { id },
      data: {
        ...data,
        ...(packageWrites !== undefined
          ? {
              packages: {
                deleteMany: {},
                ...(packageWrites.length > 0
                  ? { create: packageWrites }
                  : {}),
              },
            }
          : {}),
      },
      include: { packages: true },
    });

    return serializeAdminProduct(
      updated,
      packageWrites !== undefined ? updated.packages : undefined,
    );
  } catch (error) {
    const unique = packageUniqueMessage(error);
    if (unique) throw new ProductServiceError(unique, 409);
    throw error;
  }
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

/** Hard-delete from the local ERP database. */
export async function permanentlyDeleteProduct(
  id: string,
  scope: PermanentDeleteScope,
) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) {
    throw new ProductServiceError("Product not found", 404);
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
 * Increase local stock for returned POS items (by product id).
 * Virtual bundles restore stock on the linked base unit (qty × multiplier).
 */
export async function restockProductsByWcId(
  items: { wcId: number; qty: number }[],
): Promise<{ wcId: number; stockQuantity: number }[]> {
  const results: { wcId: number; stockQuantity: number }[] = [];

  for (const item of items) {
    const qty = Math.round(Math.abs(item.qty) * 1000) / 1000;
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

    const updated = await prisma.product.update({
      where: { id: target.id },
      data: { stockQuantity: nextQty, stockStatus },
    });

    results.push({ wcId: updated.wcId, stockQuantity: updated.stockQuantity });
  }

  return results;
}

export { serializeAdminProduct };
