import type { Prisma } from "@prisma/client";

/**
 * Search products by Arabic name, Chinese name, English name, barcode, or SKU.
 */
export function productTextSearchOr(q: string): Prisma.ProductWhereInput[] {
  const term = String(q ?? "").trim();
  if (!term) return [];
  return [
    { name: { contains: term } },
    { nameZh: { contains: term } },
    { nameEn: { contains: term } },
    { barcode: { contains: term } },
    { sku: { contains: term } },
    { packages: { some: { barcode: { contains: term } } } },
    { packages: { some: { name: { contains: term } } } },
    { packages: { some: { nameZh: { contains: term } } } },
  ];
}
