import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface BulkProductRow {
  Local_ID: string;
  Name?: string;
  Barcode?: string | null;
  Price: number;
  Sale_Price?: number | null;
  Stock_Quantity: number;
  Stock_Status: string;
  /** Trimmed brand name. Undefined when the column is absent. Empty clears the brand. */
  Brand?: string;
  /** Trimmed category name. Undefined when the column is absent. Empty clears the category. */
  Category?: string;
}

export class BulkUpdateError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "BulkUpdateError";
  }
}

function categorySlug(name: string): string {
  const ascii = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (ascii) return ascii.slice(0, 60);
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `cat-${hash.toString(16)}`;
}

async function uniqueCategorySlug(
  tx: Prisma.TransactionClient,
  name: string,
): Promise<string> {
  const base = categorySlug(name);
  let slug = base;
  let n = 1;
  while (await tx.category.findUnique({ where: { slug }, select: { id: true } })) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

/**
 * Resolve a category by Arabic name, creating it once per distinct name.
 * The in-memory cache stops the same new name from being inserted twice.
 */
async function resolveCategoryId(
  tx: Prisma.TransactionClient,
  cache: Map<string, string>,
  name: string,
): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const cached = cache.get(trimmed);
  if (cached) return cached;

  const existing = await tx.category.findFirst({
    where: { name: trimmed },
    select: { id: true },
  });
  if (existing) {
    cache.set(trimmed, existing.id);
    return existing.id;
  }

  const created = await tx.category.create({
    data: {
      name: trimmed,
      nameEn: trimmed,
      nameZh: trimmed,
      slug: await uniqueCategorySlug(tx, trimmed),
    },
    select: { id: true },
  });
  cache.set(trimmed, created.id);
  return created.id;
}

async function resolveBrandId(
  tx: Prisma.TransactionClient,
  cache: Map<string, string>,
  name: string,
): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const cached = cache.get(trimmed);
  if (cached) return cached;

  const existing = await tx.brand.findFirst({
    where: { name: trimmed },
    select: { id: true },
  });
  if (existing) {
    cache.set(trimmed, existing.id);
    return existing.id;
  }

  const created = await tx.brand.create({
    data: {
      name: trimmed,
      nameEn: trimmed,
      nameZh: trimmed,
    },
    select: { id: true },
  });
  cache.set(trimmed, created.id);
  return created.id;
}

/**
 * Update products in the local ERP database.
 * Brand and Category cells are matched by name and created when missing.
 */
export async function bulkUpdateProducts(rows: BulkProductRow[]) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new BulkUpdateError("No products to update", 400);
  }

  const normalized = rows.map((row, index) => {
    const localId = String(row.Local_ID ?? "").trim();
    const price = Number(row.Price);
    const stockQuantity = Math.floor(Number(row.Stock_Quantity));
    const stockStatusRaw = String(row.Stock_Status ?? "instock")
      .trim()
      .toLowerCase();
    const stockStatus =
      stockStatusRaw === "outofstock" ? "outofstock" : "instock";

    let salePrice: number | null = null;
    const saleRaw = row.Sale_Price;
    if (saleRaw !== null && saleRaw !== undefined) {
      const sale = Number(saleRaw);
      if (Number.isFinite(sale) && sale > 0) {
        salePrice = sale;
      }
    }

    if (!localId) {
      throw new BulkUpdateError(`Row ${index + 1}: Local_ID is required`, 400);
    }
    if (!Number.isFinite(price) || price < 0) {
      throw new BulkUpdateError(`Row ${index + 1}: invalid Price`, 400);
    }
    if (!Number.isFinite(stockQuantity) || stockQuantity < 0) {
      throw new BulkUpdateError(
        `Row ${index + 1}: invalid Stock_Quantity`,
        400,
      );
    }
    if (salePrice != null && salePrice > price) {
      throw new BulkUpdateError(
        `Row ${index + 1}: Sale_Price cannot be greater than Price`,
        400,
      );
    }

    const name =
      row.Name != null && String(row.Name).trim()
        ? String(row.Name).trim()
        : undefined;
    const barcode =
      row.Barcode === undefined
        ? undefined
        : row.Barcode == null || String(row.Barcode).trim() === ""
          ? null
          : String(row.Barcode).trim();

    return {
      localId,
      name,
      barcode,
      price,
      salePrice,
      stockQuantity,
      stockStatus,
      brand: row.Brand,
      category: row.Category,
    };
  });

  const updated = await prisma.$transaction(
    async (tx) => {
      const [categories, brands] = await Promise.all([
        tx.category.findMany({ select: { id: true, name: true } }),
        tx.brand.findMany({ select: { id: true, name: true } }),
      ]);
      const categoryCache = new Map(categories.map((row) => [row.name, row.id]));
      const brandCache = new Map(brands.map((row) => [row.name, row.id]));

      for (const row of normalized) {
        const data: Prisma.ProductUncheckedUpdateInput = {
          ...(row.name !== undefined ? { name: row.name } : {}),
          ...(row.barcode !== undefined ? { barcode: row.barcode } : {}),
          price: row.price,
          salePrice: row.salePrice,
          stockQuantity: row.stockQuantity,
          stockStatus: row.stockStatus,
        };

        if (row.category !== undefined) {
          data.categoryId = await resolveCategoryId(
            tx,
            categoryCache,
            row.category,
          );
        }
        if (row.brand !== undefined) {
          data.brandId = await resolveBrandId(tx, brandCache, row.brand);
        }

        await tx.product.update({
          where: { id: row.localId },
          data,
        });
      }

      return normalized.length;
    },
    { timeout: 120_000 },
  );

  return { updated };
}
