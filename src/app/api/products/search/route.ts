import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/products/search?q= — single-unit products across the whole catalog.
 * GET /api/products/search?id= — one product, used to label an existing link.
 *
 * SQLite `contains` is case-insensitive for Latin text. Prisma `mode: "insensitive"`
 * is not supported on this database.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim() ?? "";
  if (id) {
    const product = await prisma.product.findFirst({
      where: { id, isDeleted: false },
      select: {
        id: true,
        name: true,
        barcode: true,
        stockQuantity: true,
      },
    });
    return NextResponse.json({ product });
  }

  const query = searchParams.get("q")?.trim() ?? "";
  if (!query) {
    return NextResponse.json({ products: [] });
  }

  const excludeId = searchParams.get("excludeId")?.trim() ?? "";

  const products = await prisma.product.findMany({
    where: {
      isDeleted: false,
      linkedProductId: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      OR: [
        { name: { contains: query } },
        { barcode: { contains: query } },
      ],
    },
    select: {
      id: true,
      name: true,
      barcode: true,
      stockQuantity: true,
    },
    orderBy: { name: "asc" },
    take: 20,
  });

  return NextResponse.json({ products });
}
