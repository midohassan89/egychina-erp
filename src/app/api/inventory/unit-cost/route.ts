import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  resolveLastPurchaseUnitCost,
  resolveProductUnitCost,
} from "@/lib/inventory/resolveUnitCost";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

/** GET /api/inventory/unit-cost?productId= — last purchase cost or price fallback */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId")?.trim();
  if (!productId) {
    return NextResponse.json({ error: "productId required" }, { status: 400 });
  }

  const product = await prisma.product.findFirst({
    where: { id: productId, isDeleted: false },
    select: {
      id: true,
      name: true,
      price: true,
      stockQuantity: true,
      sku: true,
      barcode: true,
    },
  });
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const unitCost =
    searchParams.get("purchaseOnly") === "1"
      ? await resolveLastPurchaseUnitCost(prisma, productId)
      : await resolveProductUnitCost(prisma, productId);

  return NextResponse.json({
    productId: product.id,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    unitCost,
    stockQuantity: product.stockQuantity,
    sellPrice: product.price,
  });
}
