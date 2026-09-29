import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

/** GET /api/store/categories — departments that have at least one product. */
export async function GET() {
  try {
    const categories = await prisma.category.findMany({
      where: {
        products: { some: { isDeleted: false } },
      },
      select: {
        id: true,
        name: true,
        nameEn: true,
        nameZh: true,
        slug: true,
        _count: { select: { products: true } },
      },
      orderBy: { products: { _count: "desc" } },
    });

    return NextResponse.json(
      categories.map(({ _count, ...category }) => ({
        ...category,
        productCount: _count.products,
      })),
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("[api/store/categories]", error);
    return NextResponse.json(
      { error: "Could not load categories" },
      { status: 500, headers: corsHeaders },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
