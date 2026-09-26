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
    const search = req.nextUrl.searchParams.get("search")?.trim() ?? "";

    const rows = await prisma.product.findMany({
      where: {
        isDeleted: false,
        ...(categoryId ? { categoryId } : {}),
        ...(search ? { name: { contains: search } } : {}),
      },
      select: {
        id: true,
        name: true,
        price: true,
        imageUrl: true,
        categoryId: true,
        stockQuantity: true,
      },
      orderBy: { id: "desc" },
      take: 16,
    });

    const products = rows.map((product) => ({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.imageUrl,
      categoryId: product.categoryId,
      stock: product.stockQuantity,
    }));

    return NextResponse.json(products, { headers: corsHeaders });
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
