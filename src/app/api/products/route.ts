import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { prismaProductToCached } from "@/lib/products/mapProduct";
import type { Prisma } from "@prisma/client";

/** Live inventory is stockQuantity. Do not select the removed storefront `stock` column. */
const productSelect = {
  id: true,
  wcId: true,
  name: true,
  nameEn: true,
  nameZh: true,
  sku: true,
  barcode: true,
  price: true,
  salePrice: true,
  buyingCost: true,
  purchasePackSize: true,
  stockQuantity: true,
  stockStatus: true,
  imageUrl: true,
  isDeleted: true,
  isFavorite: true,
  isWeighed: true,
  linkedProductId: true,
  bundleMultiplier: true,
  categoryId: true,
  brandId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProductSelect;

/**
 * Fast catalog read from local Prisma DB (POS source of truth).
 *
 * - Default (no `page`): full active catalog as CachedProduct[] for POS.
 * - With `page`: paginated admin rows.
 * - `q`: filter by name, barcode, or SKU.
 * - `trash=1`: only soft-deleted products (admin). Default excludes trash.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const pageParam = searchParams.get("page");
    const trash = searchParams.get("trash") === "1";
    const weighed = searchParams.get("weighed") === "1";
    const categoryId = searchParams.get("categoryId")?.trim() ?? "";
    const brandId = searchParams.get("brandId")?.trim() ?? "";
    const stockStatusFilter = searchParams.get("stockStatus")?.trim() ?? "";
    const perPageRaw = Number(searchParams.get("perPage") ?? 20);
    const perPage = Math.min(
      10_000,
      Math.max(1, Number.isFinite(perPageRaw) ? perPageRaw : 20),
    );

    const filters: Prisma.ProductWhereInput[] = [
      weighed ? { isDeleted: false, isWeighed: true } : { isDeleted: trash },
    ];

    if (q) {
      filters.push({
        OR: [
          { name: { contains: q } },
          { barcode: { contains: q } },
          { sku: { contains: q } },
        ],
      });
    }

    if (stockStatusFilter === "instock" || stockStatusFilter === "outofstock") {
      filters.push({ stockStatus: stockStatusFilter });
    }

    if (categoryId) {
      filters.push({ categoryId });
    }

    if (brandId) {
      filters.push({ brandId });
    }

    const where: Prisma.ProductWhereInput = { AND: filters };

    // POS / full catalog (CachedProduct shape) — never include trash
    if (!pageParam) {
      const products = await prisma.product.findMany({
        where: {
          isDeleted: false,
          ...(q
            ? {
                OR: [
                  { name: { contains: q } },
                  { barcode: { contains: q } },
                  { sku: { contains: q } },
                ],
              }
            : {}),
        },
        orderBy: { name: "asc" },
        select: productSelect,
      });
      const cached = products.map((product) => prismaProductToCached(product));
      return NextResponse.json({
        products: cached,
        count: cached.length,
        source: "prisma",
      });
    }

    const page = Math.max(1, Number(pageParam) || 1);
    const catalogScope: Prisma.ProductWhereInput = weighed
      ? { isWeighed: true, isDeleted: false }
      : { isDeleted: false };
    const sharedOptionFilters: Prisma.ProductWhereInput[] = [catalogScope];
    if (q) {
      sharedOptionFilters.push({
        OR: [
          { name: { contains: q } },
          { barcode: { contains: q } },
          { sku: { contains: q } },
        ],
      });
    }
    if (stockStatusFilter === "instock" || stockStatusFilter === "outofstock") {
      sharedOptionFilters.push({ stockStatus: stockStatusFilter });
    }
    const categoryOptionScope: Prisma.ProductWhereInput = {
      AND: [
        ...sharedOptionFilters,
        ...(brandId ? [{ brandId }] : []),
      ],
    };
    const brandOptionScope: Prisma.ProductWhereInput = {
      AND: [
        ...sharedOptionFilters,
        ...(categoryId ? [{ categoryId }] : []),
      ],
    };
    const stockOptionScope: Prisma.ProductWhereInput = {
      AND: [
        weighed
          ? { isWeighed: true, isDeleted: false }
          : { isDeleted: trash },
        ...(q
          ? [
              {
                OR: [
                  { name: { contains: q } },
                  { barcode: { contains: q } },
                  { sku: { contains: q } },
                ],
              },
            ]
          : []),
        ...(categoryId ? [{ categoryId }] : []),
        ...(brandId ? [{ brandId }] : []),
      ],
    };
    const [total, rows, weighedCategories, catalogBrands, stockGroups] =
      await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (page - 1) * perPage,
        take: perPage,
        include: { brand: true, category: true },
      }),
      trash
        ? Promise.resolve([])
        : prisma.category.findMany({
            where: { products: { some: categoryOptionScope } },
            orderBy: { name: "asc" },
            select: { id: true, name: true },
          }),
      trash
        ? Promise.resolve([])
        : prisma.brand.findMany({
            where: { products: { some: brandOptionScope } },
            orderBy: { name: "asc" },
            select: { id: true, name: true },
          }),
      prisma.product.groupBy({
        by: ["stockStatus"],
        where: stockOptionScope,
      }),
    ]);

    const lastPurchaseCost = new Map<string, number>();
    if (weighed && rows.length > 0) {
      const purchases = await prisma.purchaseInvoiceItem.findMany({
        where: { productId: { in: rows.map((row) => row.id) } },
        orderBy: { id: "desc" },
        select: { productId: true, unitCost: true },
      });
      for (const purchase of purchases) {
        if (!lastPurchaseCost.has(purchase.productId)) {
          lastPurchaseCost.set(purchase.productId, purchase.unitCost);
        }
      }
    }

    const products = rows.map((p) => {
      const invoiceCost = lastPurchaseCost.get(p.id);
      const lastPurchasePrice = invoiceCost ?? p.buyingCost;
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
      buyingCost: p.buyingCost,
      lastPurchasePrice,
      purchasePackSize: p.purchasePackSize,
      stockQuantity: p.stockQuantity,
      stockStatus: p.stockStatus,
      imageUrl: p.imageUrl,
      isDeleted: p.isDeleted,
      isFavorite: p.isFavorite,
      isWeighed: p.isWeighed,
      linkedProductId: p.linkedProductId,
      bundleMultiplier: p.bundleMultiplier,
      categoryId: p.categoryId,
      brandId: p.brandId,
      categoryName: p.category?.name ?? null,
      brandName: p.brand?.name ?? null,
      updatedAt: p.updatedAt.toISOString(),
    };
    });

    return NextResponse.json({
      products,
      total,
      page,
      perPage,
      pageCount: Math.max(1, Math.ceil(total / perPage)),
      trash,
      ...(!trash
        ? { categories: weighedCategories, brands: catalogBrands }
        : {}),
      stockStatuses: (["instock", "outofstock"] as const).filter((status) =>
        stockGroups.some((group) => group.stockStatus === status),
      ),
      source: "prisma",
    });
  } catch (error) {
    console.error("[api/products]", error);
    return NextResponse.json(
      { error: "Failed to load products" },
      { status: 500 },
    );
  }
}
