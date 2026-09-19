import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { wooCommerceFetch } from "@/lib/woocommerce/client";
import type { WooCommerceProduct } from "@/types/woocommerce";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

/**
 * GET /api/inventory/stock-take/products
 * Active products for stock take. Optional ?categoryId= (WooCommerce category).
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
  const categoryIdRaw = searchParams.get("categoryId")?.trim() ?? "";
  const categoryId = categoryIdRaw ? Number(categoryIdRaw) : null;

  let wcIdFilter: number[] | null = null;

  if (categoryId != null && Number.isFinite(categoryId) && categoryId > 0) {
    try {
      const wcIds: number[] = [];
      let page = 1;
      for (;;) {
        const batch = await wooCommerceFetch<WooCommerceProduct[]>("products", {
          params: {
            category: categoryId,
            per_page: 100,
            page,
            status: "publish",
          },
        });
        if (!batch.length) break;
        for (const p of batch) wcIds.push(p.id);
        if (batch.length < 100) break;
        page += 1;
        if (page > 50) break;
      }
      wcIdFilter = wcIds;
    } catch (error) {
      console.error("[api/inventory/stock-take/products] category filter", error);
      return NextResponse.json(
        { error: "Could not load WooCommerce category products" },
        { status: 502 },
      );
    }

    if (wcIdFilter.length === 0) {
      return NextResponse.json({ products: [], count: 0 });
    }
  }

  const products = await prisma.product.findMany({
    where: {
      isDeleted: false,
      ...(wcIdFilter ? { wcId: { in: wcIdFilter } } : {}),
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
