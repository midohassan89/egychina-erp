import { prisma } from "@/lib/prisma";
import { wooCommerceFetch, WooCommerceError } from "@/lib/woocommerce/client";

export class PurchaseServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "PurchaseServiceError";
  }
}

export type PurchaseInvoiceStatus = "PAID" | "PARTIAL" | "UNPAID";

export interface CreatePurchaseItemInput {
  productId: string;
  quantity: number;
  unitCost: number;
}

export interface CreatePurchaseInput {
  supplierId: number;
  invoiceNumber?: string | null;
  date?: string | null;
  paidAmount?: number;
  items: CreatePurchaseItemInput[];
}

const WC_BATCH_LIMIT = 100;

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function resolvePurchaseStatus(
  totalAmount: number,
  paidAmount: number,
): PurchaseInvoiceStatus {
  const due = roundMoney(totalAmount - paidAmount);
  if (due <= 0.001) return "PAID";
  if (paidAmount > 0.001) return "PARTIAL";
  return "UNPAID";
}

/**
 * Create purchase invoice, increase local stock, bump supplier A/P by due amount,
 * then sync stock to WooCommerce via products/batch.
 */
export async function createPurchaseInvoice(input: CreatePurchaseInput) {
  const supplierId = Number(input.supplierId);
  if (!Number.isFinite(supplierId) || supplierId <= 0) {
    throw new PurchaseServiceError("Invalid supplier", 400);
  }

  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new PurchaseServiceError("Add at least one line item", 400);
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

  let paidAmount = Number(input.paidAmount ?? 0);
  if (!Number.isFinite(paidAmount) || paidAmount < 0) {
    throw new PurchaseServiceError("Paid amount must be ≥ 0", 400);
  }
  paidAmount = roundMoney(Math.min(paidAmount, totalAmount));
  const dueAmount = roundMoney(totalAmount - paidAmount);
  const status = resolvePurchaseStatus(totalAmount, paidAmount);

  const invoiceNumber =
    input.invoiceNumber != null && String(input.invoiceNumber).trim()
      ? String(input.invoiceNumber).trim()
      : null;

  const invoiceDate = input.date ? new Date(input.date) : new Date();
  if (Number.isNaN(invoiceDate.getTime())) {
    throw new PurchaseServiceError("Invalid invoice date", 400);
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

  const stockAfter = new Map<string, { wcId: number; stockQuantity: number }>();

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.purchaseInvoice.create({
      data: {
        invoiceNumber,
        date: invoiceDate,
        supplierId,
        totalAmount,
        paidAmount,
        status,
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

    for (const [productId, qty] of qtyByProduct) {
      const current = productById.get(productId)!;
      const nextQty = current.stockQuantity + qty;
      const stockStatus = nextQty > 0 ? "instock" : current.stockStatus;

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

    // Accounts payable: only the unpaid remainder increases supplier balance.
    if (dueAmount > 0) {
      await tx.supplier.update({
        where: { id: supplierId },
        data: { balance: { increment: dueAmount } },
      });
    }

    return created;
  });

  const wooUpdates = [...stockAfter.values()].map((row) => ({
    id: row.wcId,
    stock_quantity: row.stockQuantity,
    manage_stock: true,
    stock_status: row.stockQuantity > 0 ? "instock" : "outofstock",
  }));

  let wooSynced = 0;
  let wooError: string | null = null;

  for (let i = 0; i < wooUpdates.length; i += WC_BATCH_LIMIT) {
    const chunk = wooUpdates.slice(i, i + WC_BATCH_LIMIT);
    try {
      await wooCommerceFetch("products/batch", {
        method: "POST",
        body: { update: chunk },
      });
      wooSynced += chunk.length;
    } catch (error) {
      wooError =
        error instanceof WooCommerceError
          ? error.message
          : "WooCommerce batch sync failed";
      break;
    }
  }

  return {
    invoice: {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.date.toISOString(),
      supplierId: invoice.supplierId,
      supplierName: invoice.supplier.name,
      totalAmount: invoice.totalAmount,
      paidAmount: invoice.paidAmount,
      status: invoice.status,
      dueAmount,
      itemCount: invoice.items.length,
    },
    stockUpdated: stockAfter.size,
    wooSynced,
    wooError,
  };
}
