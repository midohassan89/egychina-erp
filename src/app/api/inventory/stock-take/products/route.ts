import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

/**
 * GET /api/inventory/stock-take/products
 * Active products for stock take. Optional ?categoryId= (local category id).
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const categoryId = searchParams.get("categoryId")?.trim() ?? "";

  const products = await prisma.product.findMany({
    where: {
      isDeleted: false,
      ...(categoryId ? { categoryId } : {}),
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
    select: {
      id: true,
      wcId: true,
      name: true,
      sku: true,
      barcode: true,
      stockQuantity: true,
      price: true,
      salePrice: true,
    },
  });

  return NextResponse.json({
    products: products.map((p) => ({
      id: p.id,
      wcId: p.wcId,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      expectedQuantity: p.stockQuantity,
      price: p.salePrice ?? p.price,
    })),
    count: products.length,
  });
}
