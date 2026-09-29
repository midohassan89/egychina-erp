import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/** GET /api/store/products — public catalog for the storefront. */
export async function GET(req: NextRequest) {
  try {
    const categoryId = req.nextUrl.searchParams.get("categoryId")?.trim() ?? "";
    const brandId = req.nextUrl.searchParams.get("brandId")?.trim() ?? "";
    const search = req.nextUrl.searchParams.get("search")?.trim() ?? "";
    const pageRaw = Number(req.nextUrl.searchParams.get("page") ?? "1");
    const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? "20");
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
    const limit =
      Number.isFinite(limitRaw) && limitRaw >= 1 ? Math.floor(limitRaw) : 20;
    const skip = (page - 1) * limit;

    const where = {
      isDeleted: false,
      ...(categoryId ? { categoryId } : {}),
      ...(brandId ? { brandId } : {}),
      ...(search ? { name: { contains: search } } : {}),
    };

    const filters: Prisma.Sql[] = [Prisma.sql`p.isDeleted = 0`];

    if (categoryId) {
      filters.push(Prisma.sql`p.categoryId = ${categoryId}`);
    }

    if (brandId) {
      filters.push(Prisma.sql`p.brandId = ${brandId}`);
    }

    if (search) {
      filters.push(Prisma.sql`p.name LIKE ${`%${search}%`}`);
    }

    const whereSql = Prisma.join(filters, " AND ");

    const [idRows, total] = await Promise.all([
      prisma.$queryRaw<{ id: string }[]>`
        SELECT p.id
        FROM Product p
        WHERE ${whereSql}
        ORDER BY
          CASE
            WHEN LOWER(p.stockStatus) = 'outofstock' OR p.stockQuantity <= 0 THEN 1
            ELSE 0
          END ASC,
          CASE
            WHEN LOWER(p.stockStatus) = 'instock' THEN 0
            ELSE 1
          END ASC,
          p.createdAt DESC
        LIMIT ${limit} OFFSET ${skip}
      `,
      prisma.product.count({ where }),
    ]);

    const orderedIds = idRows.map((row) => row.id);
    const unordered = orderedIds.length
      ? await prisma.product.findMany({
          where: { id: { in: orderedIds } },
          include: { brand: true },
        })
      : [];
    const byId = new Map(unordered.map((product) => [product.id, product]));
    const rows = orderedIds.flatMap((id) => {
      const product = byId.get(id);
      return product ? [product] : [];
    });

    const products = rows.map((product) => ({
      id: product.id,
      name: product.name,
      nameEn: product.nameEn,
      nameZh: product.nameZh,
      price: product.price,
      image: product.imageUrl,
      categoryId: product.categoryId,
      stock: product.stockQuantity,
      stockStatus: product.stockStatus,
      brand: product.brand
        ? {
            id: product.brand.id,
            name: product.brand.name,
            nameEn: product.brand.nameEn,
            nameZh: product.brand.nameZh,
            image: product.brand.image,
          }
        : null,
    }));

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json(
      {
        products,
        meta: {
          total,
          page,
          limit,
          totalPages,
          hasMore: page < totalPages,
        },
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("[api/store/products]", error);
    return NextResponse.json(
      { error: "Could not load products" },
      { status: 500, headers: corsHeaders },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
