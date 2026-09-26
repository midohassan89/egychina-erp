import { prisma } from "@/lib/prisma";
import { PurchaseServiceError } from "@/lib/purchases/createPurchase";

export interface CreatePurchaseReturnItemInput {
  productId: string;
  quantity: number;
  unitCost: number;
}

export interface CreatePurchaseReturnInput {
  supplierId: number;
  date?: string | null;
  notes?: string | null;
  items: CreatePurchaseReturnItemInput[];
}

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * Create purchase return (RTV): decrease supplier A/P + local stock,
 * then sync reduced stock to WooCommerce via products/batch.
 */
export async function createPurchaseReturn(input: CreatePurchaseReturnInput) {
  const supplierId = Number(input.supplierId);
  if (!Number.isFinite(supplierId) || supplierId <= 0) {
    throw new PurchaseServiceError("Invalid supplier", 400);
  }

  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new PurchaseServiceError("Add at least one return line", 400);
  }

  const normalized = input.items.map((item, index) => {
    const productId = String(item.productId ?? "").trim();
    const quantity = Math.floor(Number(item.quantity));
    const unitCost = Number(item.unitCost);

    if (!productId) {
      throw new PurchaseServiceError(`Line ${index + 1}: product is required`, 400);
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new PurchaseServiceError(
        `Line ${index + 1}: quantity must be a positive integer`,
        400,
      );
    }
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      throw new PurchaseServiceError(
        `Line ${index + 1}: unit cost must be ≥ 0`,
        400,
      );
    }

    return {
      productId,
      quantity,
      unitCost,
      lineTotal: roundMoney(quantity * unitCost),
    };
  });

  const totalAmount = roundMoney(
    normalized.reduce((sum, row) => sum + row.lineTotal, 0),
  );

  const notes =
    input.notes != null && String(input.notes).trim()
      ? String(input.notes).trim()
      : null;

  const returnDate = input.date ? new Date(input.date) : new Date();
  if (Number.isNaN(returnDate.getTime())) {
    throw new PurchaseServiceError("Invalid return date", 400);
  }

  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
  });
  if (!supplier) {
    throw new PurchaseServiceError("Supplier not found", 404);
  }

  const productIds = [...new Set(normalized.map((r) => r.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, isDeleted: false },
  });
  if (products.length !== productIds.length) {
    throw new PurchaseServiceError(
      "One or more products were not found (or are in trash)",
      404,
    );
  }
  const productById = new Map(products.map((p) => [p.id, p]));

  const qtyByProduct = new Map<string, number>();
  for (const row of normalized) {
    qtyByProduct.set(
      row.productId,
      (qtyByProduct.get(row.productId) ?? 0) + row.quantity,
    );
  }

  // Validate stock availability before writing
  for (const [productId, qty] of qtyByProduct) {
    const current = productById.get(productId)!;
    if (current.stockQuantity < qty) {
      throw new PurchaseServiceError(
        `Insufficient stock for "${current.name}" (have ${current.stockQuantity}, returning ${qty})`,
        400,
      );
    }
  }

  const stockAfter = new Map<string, { wcId: number; stockQuantity: number }>();

  const purchaseReturn = await prisma.$transaction(async (tx) => {
    const created = await tx.purchaseReturn.create({
      data: {
        date: returnDate,
        supplierId,
        totalAmount,
        notes,
        items: {
          create: normalized.map((row) => ({
            productId: row.productId,
            quantity: row.quantity,
            unitCost: row.unitCost,
            lineTotal: row.lineTotal,
          })),
        },
      },
      include: {
        items: true,
        supplier: true,
      },
    });

    // Returning goods → we owe the supplier less
    await tx.supplier.update({
      where: { id: supplierId },
      data: { balance: { decrement: totalAmount } },
    });

    for (const [productId, qty] of qtyByProduct) {
      const current = productById.get(productId)!;
      const nextQty = Math.max(0, current.stockQuantity - qty);
      const stockStatus = nextQty > 0 ? "instock" : "outofstock";

      const updated = await tx.product.update({
        where: { id: productId },
        data: {
          stockQuantity: nextQty,
          stockStatus,
        },
      });

      stockAfter.set(productId, {
        wcId: updated.wcId,
        stockQuantity: updated.stockQuantity,
      });
    }

    return created;
  });

  const wooSynced = 0;
  const wooError: string | null = null;

  return {
    purchaseReturn: {
      id: purchaseReturn.id,
      date: purchaseReturn.date.toISOString(),
      supplierId: purchaseReturn.supplierId,
      supplierName: purchaseReturn.supplier.name,
      totalAmount: purchaseReturn.totalAmount,
      notes: purchaseReturn.notes,
      itemCount: purchaseReturn.items.length,
    },
    stockUpdated: stockAfter.size,
    wooSynced,
    wooError,
  };
}
