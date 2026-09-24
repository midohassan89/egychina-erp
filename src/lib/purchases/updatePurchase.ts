import { prisma } from "@/lib/prisma";
import { syncPurchaseTreasuryPayment } from "@/lib/purchases/purchaseTreasury";
import { wooCommerceFetch, WooCommerceError } from "@/lib/woocommerce/client";
import {
  PurchaseServiceError,
  resolvePurchaseStatus,
  type CreatePurchaseItemInput,
} from "@/lib/purchases/createPurchase";

const WC_BATCH_LIMIT = 100;

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export interface UpdatePurchaseInput {
  supplierId: number;
  invoiceNumber?: string | null;
  date?: string | null;
  paidAmount?: number;
  items: CreatePurchaseItemInput[];
}

/**
 * Admin-only purchase invoice edit.
 * Applies stock deltas (newQty − oldQty) per product and adjusts supplier A/P.
 */
export async function updatePurchaseInvoice(
  invoiceId: number,
  input: UpdatePurchaseInput,
) {
  if (!Number.isFinite(invoiceId) || invoiceId <= 0) {
    throw new PurchaseServiceError("Invalid invoice id", 400);
  }

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

  const newTotal = roundMoney(
    normalized.reduce((sum, row) => sum + row.lineTotal, 0),
  );

  let paidAmount = Number(input.paidAmount ?? 0);
  if (!Number.isFinite(paidAmount) || paidAmount < 0) {
    throw new PurchaseServiceError("Paid amount must be ≥ 0", 400);
  }
  paidAmount = roundMoney(Math.min(paidAmount, newTotal));
  const newDue = roundMoney(newTotal - paidAmount);
  const status = resolvePurchaseStatus(newTotal, paidAmount);

  const invoiceNumber =
    input.invoiceNumber != null && String(input.invoiceNumber).trim()
      ? String(input.invoiceNumber).trim()
      : null;

  const invoiceDate = input.date ? new Date(input.date) : new Date();
  if (Number.isNaN(invoiceDate.getTime())) {
    throw new PurchaseServiceError("Invalid invoice date", 400);
  }

  const existing = await prisma.purchaseInvoice.findUnique({
    where: { id: invoiceId },
    include: { items: true, supplier: true },
  });
  if (!existing) {
    throw new PurchaseServiceError("Invoice not found", 404);
  }

  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
  });
  if (!supplier) {
    throw new PurchaseServiceError("Supplier not found", 404);
  }

  const oldQtyByProduct = new Map<string, number>();
  for (const item of existing.items) {
    oldQtyByProduct.set(
      item.productId,
      (oldQtyByProduct.get(item.productId) ?? 0) + item.quantity,
    );
  }

  const newQtyByProduct = new Map<string, number>();
  for (const row of normalized) {
    newQtyByProduct.set(
      row.productId,
      (newQtyByProduct.get(row.productId) ?? 0) + row.quantity,
    );
  }

  const allProductIds = [
    ...new Set([...oldQtyByProduct.keys(), ...newQtyByProduct.keys()]),
  ];

  const products = await prisma.product.findMany({
    where: { id: { in: allProductIds } },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  for (const productId of newQtyByProduct.keys()) {
    const p = productById.get(productId);
    if (!p || p.isDeleted) {
      throw new PurchaseServiceError(
        "One or more products were not found (or are in trash)",
        404,
      );
    }
  }

  // Validate stock won't go negative for reductions.
  for (const productId of allProductIds) {
    const oldQty = oldQtyByProduct.get(productId) ?? 0;
    const newQty = newQtyByProduct.get(productId) ?? 0;
    const delta = newQty - oldQty;
    if (delta === 0) continue;
    const current = productById.get(productId);
    if (!current) {
      throw new PurchaseServiceError(
        `Product ${productId} is missing and cannot be stock-adjusted`,
        404,
      );
    }
    if (delta < 0 && current.stockQuantity + delta < 0) {
      throw new PurchaseServiceError(
        `Insufficient stock for "${current.name}" to reduce this invoice (have ${current.stockQuantity}, need ${Math.abs(delta)} less)`,
        400,
      );
    }
  }

  const oldDue = roundMoney(existing.totalAmount - existing.paidAmount);
  const supplierDueDelta = roundMoney(newDue - oldDue);
  const oldSupplierId = existing.supplierId;

  const stockAfter = new Map<string, { wcId: number; stockQuantity: number }>();

  const updated = await prisma.$transaction(async (tx) => {
    // Apply stock deltas
    for (const productId of allProductIds) {
      const oldQty = oldQtyByProduct.get(productId) ?? 0;
      const newQty = newQtyByProduct.get(productId) ?? 0;
      const delta = newQty - oldQty;
      if (delta === 0) continue;

      const current = productById.get(productId)!;
      const nextQty = current.stockQuantity + delta;
      const stockStatus =
        nextQty > 0 ? "instock" : nextQty === 0 ? "outofstock" : current.stockStatus;

      const product = await tx.product.update({
        where: { id: productId },
        data: { stockQuantity: nextQty, stockStatus },
      });
      stockAfter.set(productId, {
        wcId: product.wcId,
        stockQuantity: product.stockQuantity,
      });
    }

    // Replace line items
    await tx.purchaseInvoiceItem.deleteMany({ where: { invoiceId } });
    await tx.purchaseInvoiceItem.createMany({
      data: normalized.map((row) => ({
        invoiceId,
        productId: row.productId,
        quantity: row.quantity,
        unitCost: row.unitCost,
        lineTotal: row.lineTotal,
      })),
    });

    const invoice = await tx.purchaseInvoice.update({
      where: { id: invoiceId },
      data: {
        invoiceNumber,
        date: invoiceDate,
        supplierId,
        totalAmount: newTotal,
        paidAmount,
        status,
      },
      include: {
        items: true,
        supplier: { select: { id: true, name: true } },
      },
    });

    try {
      await syncPurchaseTreasuryPayment(tx, {
        invoiceId,
        previousPaid: existing.paidAmount,
        nextPaid: paidAmount,
        date: invoiceDate,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("Insufficient treasury")
      ) {
        throw new PurchaseServiceError(error.message, 400);
      }
      throw error;
    }

    // Adjust supplier A/P balances
    if (oldSupplierId === supplierId) {
      if (Math.abs(supplierDueDelta) > 0.001) {
        await tx.supplier.update({
          where: { id: supplierId },
          data: { balance: { increment: supplierDueDelta } },
        });
      }
    } else {
      if (oldDue > 0.001) {
        await tx.supplier.update({
          where: { id: oldSupplierId },
          data: { balance: { decrement: oldDue } },
        });
      }
      if (newDue > 0.001) {
        await tx.supplier.update({
          where: { id: supplierId },
          data: { balance: { increment: newDue } },
        });
      }
    }

    return invoice;
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
      id: updated.id,
      invoiceNumber: updated.invoiceNumber,
      date: updated.date.toISOString(),
      supplierId: updated.supplierId,
      supplierName: updated.supplier.name,
      totalAmount: updated.totalAmount,
      paidAmount: updated.paidAmount,
      status: updated.status,
      dueAmount: newDue,
      itemCount: updated.items.length,
    },
    stockDeltas: Object.fromEntries(
      allProductIds.map((id) => [
        id,
        (newQtyByProduct.get(id) ?? 0) - (oldQtyByProduct.get(id) ?? 0),
      ]),
    ),
    stockUpdated: stockAfter.size,
    wooSynced,
    wooError,
  };
}
