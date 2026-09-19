import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { roundMoney } from "@/lib/pos/money";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

/**
 * GET /api/reports/inventory-valuation
 * Asset value (qty × unitCost) and expected retail (qty × price).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const products = await prisma.product.findMany({
    where: { isDeleted: false },
    select: {
      id: true,
      name: true,
      sku: true,
      stockQuantity: true,
      price: true,
      salePrice: true,
    },
    orderBy: { name: "asc" },
  });

  // Latest purchase unit cost per product (single pass)
  const purchaseItems = await prisma.purchaseInvoiceItem.findMany({
    orderBy: { id: "desc" },
    select: { productId: true, unitCost: true },
  });
  const unitCostByProduct = new Map<string, number>();
  for (const item of purchaseItems) {
    if (!unitCostByProduct.has(item.productId)) {
      unitCostByProduct.set(item.productId, item.unitCost);
    }
  }

  let totalAssetValue = 0;
  let expectedRetailValue = 0;
  let skuWithStock = 0;
  let totalUnits = 0;

  const lines = products.map((p) => {
    const qty = Math.max(0, p.stockQuantity);
    const unitCost = roundMoney(
      unitCostByProduct.get(p.id) ?? p.price ?? 0,
    );
    const retailPrice = roundMoney(
      p.salePrice != null && p.salePrice > 0 ? p.salePrice : p.price,
    );
    const assetValue = roundMoney(qty * unitCost);
    const retailValue = roundMoney(qty * retailPrice);

    totalAssetValue += assetValue;
    expectedRetailValue += retailValue;
    if (qty > 0) {
      skuWithStock += 1;
      totalUnits += qty;
    }

    return {
      productId: p.id,
      name: p.name,
      sku: p.sku,
      stockQuantity: qty,
      unitCost,
      retailPrice,
      assetValue,
      retailValue,
    };
  });

  totalAssetValue = roundMoney(totalAssetValue);
  expectedRetailValue = roundMoney(expectedRetailValue);
  const potentialGrossMargin = roundMoney(
    expectedRetailValue - totalAssetValue,
  );
  const marginPercent =
    expectedRetailValue > 0.001
      ? roundMoney((potentialGrossMargin / expectedRetailValue) * 100)
      : 0;

  return NextResponse.json({
    summary: {
      totalAssetValue,
      expectedRetailValue,
      potentialGrossMargin,
      marginPercent,
      productCount: products.length,
      skuWithStock,
      totalUnits,
    },
    // Top holdings by asset value (for optional detail)
    topByAssetValue: [...lines]
      .filter((l) => l.stockQuantity > 0)
      .sort((a, b) => b.assetValue - a.assetValue)
      .slice(0, 20),
  });
}
