import { NextRequest, NextResponse } from "next/server";
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

    const [rows, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { brand: true },
        orderBy: { id: "desc" },
        skip,
        take: limit,
      }),
      prisma.product.count({ where }),
    ]);

    const products = rows.map((product) => ({
      id: product.id,
      name: product.name,
      nameEn: product.nameEn,
      nameZh: product.nameZh,
      price: product.price,
      image: product.imageUrl,
      categoryId: product.categoryId,
      stock: product.stockQuantity,
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
