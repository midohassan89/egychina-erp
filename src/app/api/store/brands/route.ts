import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

/** GET /api/store/brands — brands with products, optionally limited to a category. */
export async function GET(request: NextRequest) {
  try {
    const categoryId = request.nextUrl.searchParams.get("categoryId")?.trim() ?? "";

    const brands = await prisma.brand.findMany({
      where: {
        products: {
          some: {
            isDeleted: false,
            ...(categoryId ? { categoryId } : {}),
          },
        },
      },
      select: {
        id: true,
        name: true,
        nameEn: true,
        nameZh: true,
        image: true,
        _count: {
          select: {
            products: {
              where: {
                isDeleted: false,
                ...(categoryId ? { categoryId } : {}),
              },
            },
          },
        },
      },
      orderBy: { products: { _count: "desc" } },
    });

    return NextResponse.json(
      brands.map(({ _count, ...brand }) => ({
        ...brand,
        productCount: _count.products,
      })),
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("[api/store/brands]", error);
    return NextResponse.json(
      { error: "Could not load brands" },
      { status: 500, headers: corsHeaders },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
