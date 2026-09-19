import { prisma } from "@/lib/prisma";
import { createInventoryAdjustment } from "@/lib/inventory/createAdjustment";
import { resolveProductUnitCost } from "@/lib/inventory/resolveUnitCost";

export interface StockTakeLineInput {
  productId: string;
  actualQuantity: number;
}

/**
 * Complete a physical stock take:
 * variances → MANUAL_COUNT adjustment + set stock to actual + WC batch sync.
 */
export async function completeStockTake(input: {
  userId: string;
  notes?: string | null;
  items: StockTakeLineInput[];
}) {
  if (!input.items?.length) {
    throw new Error("Submit at least one counted product");
  }

  const varianceItems: {
    productId: string;
    quantityChange: number;
    unitCost: number;
    expected: number;
    actual: number;
    name: string;
  }[] = [];

  for (const raw of input.items) {
    const productId = String(raw.productId ?? "").trim();
    const actualQuantity = Math.trunc(Number(raw.actualQuantity));

    if (!productId) throw new Error("Invalid product on a line");
    if (!Number.isFinite(actualQuantity) || actualQuantity < 0) {
      throw new Error("Actual quantity must be a non-negative integer");
    }

    const product = await prisma.product.findFirst({
      where: { id: productId, isDeleted: false },
    });
    if (!product) {
      throw new Error(`Product not found: ${productId}`);
    }

    const expected = product.stockQuantity;
    const quantityChange = actualQuantity - expected;
    if (quantityChange === 0) continue;

    const unitCost = await resolveProductUnitCost(prisma, productId);
    varianceItems.push({
      productId,
      quantityChange,
      unitCost,
      expected,
      actual: actualQuantity,
      name: product.name,
    });
  }

  if (varianceItems.length === 0) {
    return {
      ok: true,
      varianceCount: 0,
      adjustment: null,
      wooSynced: 0,
      wooError: null as string | null,
      message: "No variances — stock already matches the physical count",
    };
  }

  const notes =
    input.notes != null && String(input.notes).trim()
      ? String(input.notes).trim()
      : `Physical stock take · ${varianceItems.length} variance(s)`;

  const result = await createInventoryAdjustment({
    type: "MANUAL_COUNT",
    notes,
    userId: input.userId,
    items: varianceItems.map((v) => ({
      productId: v.productId,
      quantityChange: v.quantityChange,
      unitCost: v.unitCost,
    })),
  });

  return {
    ok: true,
    varianceCount: varianceItems.length,
    variances: varianceItems.map((v) => ({
      productId: v.productId,
      productName: v.name,
      expected: v.expected,
      actual: v.actual,
      quantityChange: v.quantityChange,
    })),
    adjustment: result.adjustment,
    wooSynced: result.wooSynced,
    wooError: result.wooError,
    message: result.wooError
      ? `Stock take saved (${varianceItems.length} variances); WooCommerce sync failed: ${result.wooError}`
      : `Stock take complete · ${varianceItems.length} variance(s) · ${result.wooSynced} products synced`,
  };
}
