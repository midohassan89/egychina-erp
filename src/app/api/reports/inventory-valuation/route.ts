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
      barcode: true,
      stockQuantity: true,
      price: true,
      salePrice: true,
      buyingCost: true,
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
  let operationalAssetValue = 0;
  let expectedRetailValue = 0;
  let skuWithStock = 0;
  let totalUnits = 0;

  const lines = products.map((p) => {
    const qty = Math.max(0, p.stockQuantity);
    const unitCost = roundMoney(
      unitCostByProduct.get(p.id) ?? (p.buyingCost > 0 ? p.buyingCost : p.price ?? 0),
    );
    const retailPrice = roundMoney(
      p.salePrice != null && p.salePrice > 0 ? p.salePrice : p.price,
    );
    const assetValue = roundMoney(qty * unitCost);
    const retailValue = roundMoney(qty * retailPrice);
    const cappedCost =
      retailPrice > 0 && unitCost > retailPrice ? retailPrice : unitCost;
    const operationalValue = roundMoney(qty * cappedCost);

    totalAssetValue += assetValue;
    operationalAssetValue += operationalValue;
    expectedRetailValue += retailValue;
    if (qty > 0) {
      skuWithStock += 1;
      totalUnits += qty;
    }

    return {
      productId: p.id,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      stockQuantity: qty,
      buyingCost: roundMoney(p.buyingCost),
      price: roundMoney(p.price),
      unitCost,
      retailPrice,
      assetValue,
      retailValue,
      anomalous: retailPrice > 0 && (unitCost > retailPrice || p.buyingCost > retailPrice),
    };
  });

  totalAssetValue = roundMoney(totalAssetValue);
  operationalAssetValue = roundMoney(operationalAssetValue);
  expectedRetailValue = roundMoney(expectedRetailValue);
  const potentialGrossMargin = roundMoney(
    expectedRetailValue - totalAssetValue,
  );
  const operationalGrossMargin = roundMoney(
    expectedRetailValue - operationalAssetValue,
  );
  const marginPercent =
    expectedRetailValue > 0.001
      ? roundMoney((potentialGrossMargin / expectedRetailValue) * 100)
      : 0;
  const anomalies = lines
    .filter((line) => line.anomalous)
    .sort((a, b) => b.assetValue - b.retailValue - (a.assetValue - a.retailValue));

  return NextResponse.json({
    summary: {
      totalAssetValue,
      operationalAssetValue,
      expectedRetailValue,
      potentialGrossMargin,
      operationalGrossMargin,
      anomalyCount: anomalies.length,
      excessCost: roundMoney(totalAssetValue - operationalAssetValue),
      marginPercent,
      productCount: products.length,
      skuWithStock,
      totalUnits,
    },
    anomalies: anomalies.slice(0, 200).map((line) => ({
      id: line.productId,
      name: line.name,
      sku: line.sku,
      barcode: line.barcode,
      stockQuantity: line.stockQuantity,
      buyingCost: line.buyingCost,
      unitCost: line.unitCost,
      price: line.price,
      retailPrice: line.retailPrice,
    })),
    // Top holdings by asset value (for optional detail)
    topByAssetValue: [...lines]
      .filter((l) => l.stockQuantity > 0)
      .sort((a, b) => b.assetValue - a.assetValue)
      .slice(0, 20),
  });
}
