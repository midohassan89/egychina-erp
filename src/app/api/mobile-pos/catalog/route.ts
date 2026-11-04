import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMobilePos } from "@/lib/pos/mobilePosAuth";
import { productTextSearchOr } from "@/lib/products/productTextSearch";
import {
  mobilePosCorsHeaders,
  mobilePosError,
  mobilePosOptions,
} from "@/lib/pos/mobilePosCors";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return mobilePosOptions();
}

/**
 * GET /api/mobile-pos/catalog
 * Lightweight active catalog for the mobile queue-buster POS.
 * Optional `q` searches Arabic / Chinese / English name, barcode, or SKU.
 */
export async function GET(request: Request) {
  try {
    const user = await requireMobilePos(request);
    if (!user) {
      return mobilePosError("غير مصرح — يرجى تسجيل الدخول مجدداً", 401);
    }

    const url = new URL(request.url);
    const q = String(url.searchParams.get("q") ?? "").trim();
    const take = Math.min(
      500,
      Math.max(1, Math.floor(Number(url.searchParams.get("limit")) || 500)),
    );

    const products = await prisma.product.findMany({
      where: {
        isDeleted: false,
        isActive: true,
        ...(q ? { OR: productTextSearchOr(q) } : {}),
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take,
      select: {
        id: true,
        name: true,
        nameEn: true,
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
            nameEn: true,
            nameZh: true,
            packSize: true,
            price: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        ok: true,
        products: products.map((p) => ({
          id: p.id,
          name: p.name,
          nameEn: p.nameEn,
          nameZh: p.nameZh,
          barcode: p.barcode,
          price: p.price,
          salePrice: p.salePrice,
          stockQuantity: p.stockQuantity,
          stock: p.stockQuantity,
          isWeighted: p.isWeighed,
          imageUrl: p.imageUrl,
          packages: p.packages.map((pkg) => ({
            id: pkg.id,
            barcode: pkg.barcode,
            name: pkg.name,
            nameEn: pkg.nameEn,
            nameZh: pkg.nameZh,
            packSize: pkg.packSize,
            price: pkg.price,
          })),
        })),
        items: products.map((p) => ({
          id: p.id,
          name: p.name,
          nameZh: p.nameZh,
          barcode: p.barcode,
          price: p.price,
          salePrice: p.salePrice,
          stockQuantity: p.stockQuantity,
        })),
        count: products.length,
      },
      { headers: mobilePosCorsHeaders },
    );
  } catch (error) {
    console.error("[api/mobile-pos/catalog]", error);
    return mobilePosError("تعذر تحميل كتالوج المنتجات", 500);
  }
}
