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
 * Full active catalog for mobile cashier offline sync (no take/limit).
 * Optional `q` still filters by Arabic / Chinese / English name, barcode, or SKU.
 */
export async function GET(request: Request) {
  try {
    const user = await requireMobilePos(request);
    if (!user) {
      return mobilePosError("غير مصرح — يرجى تسجيل الدخول مجدداً", 401);
    }

    const url = new URL(request.url);
    const q = String(url.searchParams.get("q") ?? "").trim();

    const products = await prisma.product.findMany({
      where: {
        isDeleted: false,
        isActive: true,
        ...(q ? { OR: productTextSearchOr(q) } : {}),
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
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

    const mapped = products.map((p) => ({
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
    }));

    return NextResponse.json(
      {
        ok: true,
        products: mapped,
        items: mapped,
        data: mapped,
        count: mapped.length,
      },
      { headers: mobilePosCorsHeaders },
    );
  } catch (error) {
    console.error("[api/mobile-pos/catalog]", error);
    return mobilePosError("تعذر تحميل كتالوج المنتجات", 500);
  }
}
