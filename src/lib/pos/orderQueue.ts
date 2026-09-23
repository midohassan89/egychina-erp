import { getPendingSales, saveSale } from "@/lib/cache/indexeddb";
import { saleLinesToOrderPayload } from "@/lib/pos/orderPayload";
import { isNetworkError } from "@/lib/pos/networkError";
import type { LocalSale, WooCommerceOrder } from "@/types/woocommerce";

/** Idempotent ERP persist. Business-rule issues return 200 with requiresAudit. */
async function persistSaleToErp(sale: LocalSale): Promise<void> {
  const response = await fetch("/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      paymentMethod: sale.paymentMethod,
      amount: Math.abs(sale.total),
      total: sale.total,
      isReturn: Boolean(sale.isReturn),
      shiftId: sale.shiftId,
      localId: sale.id,
      createdAt: sale.createdAt,
      customerName: sale.customerName,
      wooOrderId: sale.wooOrderId,
      lines: sale.lines.map((line) => ({
        productId: line.productId,
        name: line.name,
        qty: line.qty,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
      })),
    }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(body.error ?? "Could not save sale");
  }
}

async function syncReturnRestock(sale: LocalSale): Promise<LocalSale> {
  if (!sale.managerId) {
    throw new Error("Manager authorization missing for return restock");
  }

  const items = sale.lines
    .filter((line) => !line.isLocal && line.productId > 0)
    .map((line) => ({
      wcId: line.productId,
      qty: Math.abs(line.qty),
    }));

  if (items.length === 0) {
    const synced: LocalSale = {
      ...sale,
      syncStatus: "synced",
      syncError: undefined,
    };
    await saveSale(synced);
    return synced;
  }

  const response = await fetch("/api/pos/restock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, managerId: sale.managerId }),
  });

  if (!response.ok) {
    const body = (await response.json()) as { error?: string };
    throw new Error(body.error ?? "Could not restock returned items");
  }

  const synced: LocalSale = {
    ...sale,
    syncStatus: "synced",
    syncError: undefined,
  };
  await saveSale(synced);
  return synced;
}

/**
 * Push a single sale to WooCommerce as a completed order.
 * Updates IndexedDB sync status on success or failure.
 */
export async function syncSaleToWooCommerce(
  sale: LocalSale,
): Promise<LocalSale> {
  await persistSaleToErp(sale);

  if (sale.isReturn) {
    return syncReturnRestock(sale);
  }

  const response = await fetch("/api/woocommerce/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      saleLinesToOrderPayload(sale.lines, sale.paymentMethod, sale.customerId),
    ),
  });

  if (!response.ok) {
    const body = (await response.json()) as { error?: string };
    throw new Error(body.error ?? "Could not create WooCommerce order");
  }

  const order = (await response.json()) as WooCommerceOrder;
  const synced: LocalSale = {
    ...sale,
    wooOrderId: order.id,
    syncStatus: "synced",
    syncError: undefined,
  };
  await saveSale(synced);
  return synced;
}

/**
 * Drain the offline order queue — called on reconnect / app load / catalog sync.
 */
export async function flushOfflineOrderQueue(): Promise<{
  synced: number;
  failed: number;
  remaining: number;
}> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const pending = await getPendingSales();
    return { synced: 0, failed: 0, remaining: pending.length };
  }

  const pending = await getPendingSales();
  let synced = 0;
  let failed = 0;

  for (const sale of pending) {
    try {
      await syncSaleToWooCommerce(sale);
      synced += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Order sync failed";
      if (!isNetworkError(err)) failed += 1;
      await saveSale({
        ...sale,
        syncStatus: "pending",
        syncError: message,
      });
    }
  }

  const remaining = (await getPendingSales()).length;
  return { synced, failed, remaining };
}
