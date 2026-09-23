"use client";

import { useCallback, useState } from "react";
import type { CartLine } from "@/types/pos";
import type {
  CachedCustomer,
  LocalSale,
  PaymentMethod,
} from "@/types/woocommerce";
import { saveSale } from "@/lib/cache/indexeddb";
import { roundMoney } from "@/lib/pos/money";
import { cartToSaleLines } from "@/lib/pos/orderPayload";
import { syncSaleToWooCommerce } from "@/lib/pos/orderQueue";
import { isCashPayment } from "@/lib/pos/paymentMethods";
import { isNetworkError } from "@/lib/pos/networkError";

function newSaleId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sale-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface CompleteSaleInput {
  lines: CartLine[];
  total: number;
  paymentMethod: PaymentMethod;
  customer: CachedCustomer | null;
  tendered: number;
  isOnline: boolean;
  shiftId?: string | null;
  isReturn?: boolean;
  cashierId?: string | null;
  cashierName?: string | null;
  managerId?: string | null;
  managerName?: string | null;
}

async function restockReturnedItems(
  sale: LocalSale,
  managerId: string,
): Promise<void> {
  const items = sale.lines
    .filter((line) => !line.isLocal && line.productId > 0)
    .map((line) => ({
      wcId: line.productId,
      qty: Math.abs(line.qty),
    }));

  if (items.length === 0) return;

  const response = await fetch("/api/pos/restock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, managerId }),
  });

  if (!response.ok) {
    const body = (await response.json()) as { error?: string };
    throw new Error(body.error ?? "Could not restock returned items");
  }
}

/**
 * Offline-first checkout:
 * 1. Persist sale/return to IndexedDB immediately
 * 2. Sales: push WooCommerce completed order (stock deduct)
 * 3. Returns: restock Prisma + WooCommerce (no WC order)
 */
export function useCheckout() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSale, setLastSale] = useState<LocalSale | null>(null);

  const completeSale = useCallback(
    async (input: CompleteSaleInput): Promise<LocalSale | null> => {
      const {
        lines,
        total,
        paymentMethod,
        customer,
        tendered,
        isOnline,
        shiftId,
        isReturn = false,
        cashierId = null,
        cashierName = null,
        managerId = null,
        managerName = null,
      } = input;

      if (lines.length === 0) return null;
      if (isReturn && !managerId) {
        setError("Manager authorization required for returns");
        return null;
      }

      setIsSubmitting(true);
      setError(null);

      const saleLines = cartToSaleLines(lines);
      const absTotal = roundMoney(Math.abs(total));
      const change =
        !isReturn && isCashPayment(paymentMethod)
          ? roundMoney(Math.max(0, tendered - total))
          : 0;

      const sale: LocalSale = {
        id: newSaleId(),
        createdAt: new Date().toISOString(),
        paymentMethod,
        customerId: customer?.id ?? null,
        customerName: customer
          ? `${customer.first_name} ${customer.last_name}`.trim() ||
            customer.email
          : "Walk-in",
        lines: saleLines,
        total: isReturn ? -absTotal : total,
        tendered: isCashPayment(paymentMethod)
          ? isReturn
            ? absTotal
            : tendered
          : absTotal,
        change,
        wooOrderId: null,
        syncStatus: "pending",
        shiftId: shiftId ?? null,
        isReturn,
        cashierId,
        cashierName,
        managerId,
        managerName,
      };

      await saveSale(sale);

      if (!isOnline) {
        setLastSale(sale);
        setIsSubmitting(false);
        return sale;
      }

      // Persist to ERP first. Business-rule issues are saved with requiresAudit (HTTP 200).
      // A dropped connection keeps the ticket pending in IndexedDB.
      try {
        const checkoutRes = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentMethod,
            amount: absTotal,
            total: sale.total,
            isReturn,
            shiftId,
            localId: sale.id,
            createdAt: sale.createdAt,
            customerName: sale.customerName,
            lines: saleLines.map((line) => ({
              productId: line.productId,
              name: line.name,
              qty: line.qty,
              unitPrice: line.unitPrice,
              lineTotal: line.lineTotal,
            })),
          }),
        });
        if (!checkoutRes.ok) {
          const body = (await checkoutRes.json().catch(() => ({}))) as {
            error?: string;
          };
          const queued: LocalSale = {
            ...sale,
            syncStatus: "pending",
            syncError: body.error ?? "Checkout will retry when the server is available",
          };
          await saveSale(queued);
          setLastSale(queued);
          setIsSubmitting(false);
          return queued;
        }
      } catch (err) {
        console.warn("[checkout] sale persist error", err);
        const queued: LocalSale = {
          ...sale,
          syncStatus: "pending",
          syncError: isNetworkError(err)
            ? "Offline — will sync when online"
            : err instanceof Error
              ? err.message
              : "Could not reach the server",
        };
        await saveSale(queued);
        setLastSale(queued);
        setIsSubmitting(false);
        return queued;
      }

      if (isReturn) {
        if (!isOnline) {
          const queued: LocalSale = {
            ...sale,
            syncStatus: "pending",
            syncError: "Offline — restock will sync when online",
          };
          await saveSale(queued);
          setLastSale(queued);
          setError(queued.syncError ?? null);
          setIsSubmitting(false);
          return queued;
        }

        try {
          await restockReturnedItems(sale, managerId!);
          const synced: LocalSale = {
            ...sale,
            syncStatus: "synced",
            syncError: undefined,
          };
          await saveSale(synced);
          setLastSale(synced);
          return synced;
        } catch (err) {
          const queued: LocalSale = {
            ...sale,
            syncStatus: "pending",
            syncError:
              err instanceof Error ? err.message : "Restock failed",
          };
          await saveSale(queued);
          setLastSale(queued);
          setError(
            `${queued.syncError}. Saved on this register — will sync when online.`,
          );
          return queued;
        } finally {
          setIsSubmitting(false);
        }
      }

      if (!isOnline) {
        setLastSale(sale);
        setIsSubmitting(false);
        return sale;
      }

      try {
        const synced = await syncSaleToWooCommerce(sale);
        setLastSale(synced);
        return synced;
      } catch (err) {
        const queued: LocalSale = {
          ...sale,
          syncStatus: "pending",
          syncError:
            err instanceof Error ? err.message : "Could not create order",
        };
        await saveSale(queued);
        setLastSale(queued);
        setError(
          `${queued.syncError}. Sale saved locally — will sync when online.`,
        );
        return queued;
      } finally {
        setIsSubmitting(false);
      }
    },
    [],
  );

  return { completeSale, isSubmitting, error, lastSale, setError };
}
