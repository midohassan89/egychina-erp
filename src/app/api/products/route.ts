import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  createProductOnErpAndWoo,
  CreateProductError,
} from "@/lib/products/createProduct";
import { expandPosCatalog } from "@/lib/products/mapProduct";
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
  isActive: true,
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
    const idsOnly = searchParams.get("idsOnly") === "1";
    const idList = (searchParams.get("ids") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0 && id.length <= 64)
      .slice(0, 200);
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
          { packages: { some: { barcode: { contains: q } } } },
        ],
      });
    }

    if (stockStatusFilter === "instock") {
      filters.push({ stockQuantity: { gt: 0 } });
    } else if (stockStatusFilter === "outofstock") {
      filters.push({ stockQuantity: { lte: 0 } });
    }

    if (categoryId) {
      filters.push({ categoryId });
    }

    if (brandId) {
      filters.push({ brandId });
    }

    const where: Prisma.ProductWhereInput =
      pageParam && idList.length > 0
        ? { id: { in: idList } }
        : { AND: filters };

    if (pageParam && idsOnly) {
      const idRows = await prisma.product.findMany({
        where,
        orderBy: { name: "asc" },
        select: { id: true },
      });
      return NextResponse.json({
        ids: idRows.map((row) => row.id),
        total: idRows.length,
      });
    }

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
                  { packages: { some: { barcode: { contains: q } } } },
                  { packages: { some: { name: { contains: q } } } },
                ],
              }
            : {}),
        },
        orderBy: { name: "asc" },
        select: {
          ...productSelect,
          packages: {
            orderBy: { name: "asc" },
            select: {
              id: true,
              barcode: true,
              name: true,
              nameEn: true,
              nameZh: true,
              packSize: true,
              price: true,
              isFavorite: true,
            },
          },
        },
      });
      const cached = products.flatMap((product) =>
        expandPosCatalog(product, product.packages),
      );
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
          { packages: { some: { barcode: { contains: q } } } },
        ],
      });
    }
    if (stockStatusFilter === "instock") {
      sharedOptionFilters.push({ stockQuantity: { gt: 0 } });
    } else if (stockStatusFilter === "outofstock") {
      sharedOptionFilters.push({ stockQuantity: { lte: 0 } });
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
                  { packages: { some: { barcode: { contains: q } } } },
                ],
              },
            ]
          : []),
        ...(categoryId ? [{ categoryId }] : []),
        ...(brandId ? [{ brandId }] : []),
      ],
    };
    const exactBarcodeWhere: Prisma.ProductWhereInput | null = q
      ? {
          AND: [
            weighed
              ? { isDeleted: false, isWeighed: true }
              : { isDeleted: trash },
            {
              OR: [
                { barcode: q },
                { sku: q },
                { packages: { some: { barcode: q } } },
              ],
            },
          ],
        }
      : null;
    const [total, rows, exactRows, weighedCategories, catalogBrands, inStockCount, outOfStockCount] =
      await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (page - 1) * perPage,
        take: perPage,
        include: { brand: true, category: true, packages: true },
      }),
      exactBarcodeWhere
        ? prisma.product.findMany({
            where: exactBarcodeWhere,
            include: { brand: true, category: true, packages: true },
            take: 5,
          })
        : Promise.resolve([]),
      trash || idList.length > 0
        ? Promise.resolve([])
        : prisma.category.findMany({
            where: { products: { some: categoryOptionScope } },
            orderBy: { name: "asc" },
            select: { id: true, name: true },
          }),
      trash || idList.length > 0
        ? Promise.resolve([])
        : prisma.brand.findMany({
            where: { products: { some: brandOptionScope } },
            orderBy: { name: "asc" },
            select: { id: true, name: true },
          }),
      idList.length > 0
        ? Promise.resolve(0)
        : prisma.product.count({
            where: { AND: [stockOptionScope, { stockQuantity: { gt: 0 } }] },
          }),
      idList.length > 0
        ? Promise.resolve(0)
        : prisma.product.count({
            where: { AND: [stockOptionScope, { stockQuantity: { lte: 0 } }] },
          }),
    ]);

    const seenIds = new Set<string>();
    const orderedRows = [];
    for (const row of idList.length > 0 ? rows : [...exactRows, ...rows]) {
      if (seenIds.has(row.id)) continue;
      seenIds.add(row.id);
      orderedRows.push(row);
      if (orderedRows.length >= perPage) break;
    }

    const lastPurchaseCost = new Map<string, number>();
    if (weighed && orderedRows.length > 0) {
      const purchases = await prisma.purchaseInvoiceItem.findMany({
        where: { productId: { in: orderedRows.map((row) => row.id) } },
        orderBy: { id: "desc" },
        select: { productId: true, unitCost: true },
      });
      for (const purchase of purchases) {
        if (!lastPurchaseCost.has(purchase.productId)) {
          lastPurchaseCost.set(purchase.productId, purchase.unitCost);
        }
      }
    }

    const products = orderedRows.map((p) => {
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
      stockStatus: p.stockQuantity > 0 ? "instock" : "outofstock",
      isActive: p.isActive,
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
      scannedPackage: (() => {
        const matched = q
          ? p.packages.find((row) => row.barcode === q)
          : undefined;
        if (!matched || p.barcode === q) return null;
        return {
          barcode: matched.barcode,
          name: matched.name,
          nameEn: matched.nameEn,
          nameZh: matched.nameZh,
          packSize: matched.packSize,
        };
      })(),
      packages: p.packages.map((row) => ({
        id: row.id,
        barcode: row.barcode,
        name: row.name,
        nameEn: row.nameEn,
        nameZh: row.nameZh,
        packSize: row.packSize,
        price: row.price,
        isFavorite: row.isFavorite,
      })),
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
      stockStatuses: [
        ...(inStockCount > 0 ? (["instock"] as const) : []),
        ...(outOfStockCount > 0 ? (["outofstock"] as const) : []),
      ],
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

/**
 * POST JSON — create a product and optional packages.
 * The dashboard form posts multipart data to /api/products/create instead.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = session.user.role;
  if (role !== "MANAGER" && role !== "ACCOUNTANT" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      name?: string;
      nameEn?: string | null;
      nameZh?: string | null;
      price?: number;
      salePrice?: number | null;
      barcode?: string;
      sku?: string | null;
      stockStatus?: string;
      isWeighed?: boolean;
      isActive?: boolean;
      categoryId?: string | null;
      brandId?: string | null;
      imageUrl?: string | null;
      packages?: unknown;
    };

    const product = await createProductOnErpAndWoo({
      name: body.name ?? "",
      nameEn: body.nameEn,
      nameZh: body.nameZh,
      price: Number(body.price),
      salePrice: body.salePrice,
      barcode: body.barcode ?? "",
      sku: body.sku,
      stockQuantity: 0,
      stockStatus: body.stockStatus === "outofstock" ? "outofstock" : "instock",
      isWeighed: body.isWeighed,
      isActive: body.isActive,
      categoryId: body.categoryId,
      brandId: body.brandId,
      imageUrl: body.imageUrl,
      packages: body.packages,
    });

    return NextResponse.json({
      ok: true,
      product,
      message: "Product created",
    });
  } catch (error) {
    if (error instanceof CreateProductError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    console.error("[api/products POST]", error);
    return NextResponse.json(
      { error: "Failed to create product" },
      { status: 500 },
    );
  }
}
