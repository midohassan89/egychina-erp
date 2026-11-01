import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMobilePos } from "@/lib/pos/mobilePosAuth";

/**
 * GET /api/mobile-pos/catalog
 * Lightweight active catalog for the mobile queue-buster POS.
 */
export async function GET(request: Request) {
  const user = await requireMobilePos(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const products = await prisma.product.findMany({
      where: { isDeleted: false, isActive: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        nameZh: true,
        barcode: true,
        price: true,
        salePrice: true,
        stockQuantity: true,
        isWeighed: true,
        imageUrl: true,
        packages: {
          orderBy: { name: "asc" },
          select: {
            id: true,
            barcode: true,
            name: true,
            nameZh: true,
            packSize: true,
            price: true,
          },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        nameZh: p.nameZh,
        barcode: p.barcode,
        price: p.price,
        salePrice: p.salePrice,
        stockQuantity: p.stockQuantity,
        isWeighted: p.isWeighed,
        imageUrl: p.imageUrl,
        packages: p.packages.map((pkg) => ({
          id: pkg.id,
          barcode: pkg.barcode,
          name: pkg.name,
          nameZh: pkg.nameZh,
          packSize: pkg.packSize,
          price: pkg.price,
        })),
      })),
      count: products.length,
    });
  } catch (error) {
    console.error("[api/mobile-pos/catalog]", error);
    return NextResponse.json({ error: "Failed to load catalog" }, { status: 500 });
  }
}
