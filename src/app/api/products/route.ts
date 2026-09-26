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
  linkedProductId: true,
  bundleMultiplier: true,
  categoryId: true,
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
    const stockStatusFilter = searchParams.get("stockStatus")?.trim() ?? "";
    const perPageRaw = Number(searchParams.get("perPage") ?? 20);
    const perPage = Math.min(
      10_000,
      Math.max(1, Number.isFinite(perPageRaw) ? perPageRaw : 20),
    );

    const filters: Prisma.ProductWhereInput[] = [{ isDeleted: trash }];

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
    const [total, rows] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (page - 1) * perPage,
        take: perPage,
        select: productSelect,
      }),
    ]);

    const products = rows.map((p) => ({
      id: p.id,
      wcId: p.wcId,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      price: p.price,
      salePrice: p.salePrice,
      buyingCost: p.buyingCost,
      purchasePackSize: p.purchasePackSize,
      stockQuantity: p.stockQuantity,
      stockStatus: p.stockStatus,
      imageUrl: p.imageUrl,
      isDeleted: p.isDeleted,
      isFavorite: p.isFavorite,
      linkedProductId: p.linkedProductId,
      bundleMultiplier: p.bundleMultiplier,
      categoryId: p.categoryId,
      updatedAt: p.updatedAt.toISOString(),
    }));

    return NextResponse.json({
      products,
      total,
      page,
      perPage,
      pageCount: Math.max(1, Math.ceil(total / perPage)),
      trash,
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
