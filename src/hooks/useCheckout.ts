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
import { isCashPayment, isStaffMealPayment } from "@/lib/pos/paymentMethods";
import { isNetworkError } from "@/lib/pos/networkError";

const CHECKOUT_FETCH_TIMEOUT_MS = 8_000;

function newSaleId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sale-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

interface CompleteSaleInput {
  lines: CartLine[];
  total: number;
  paymentMethod: PaymentMethod;
  customer: CachedCustomer | null;
  tendered: number;
  employeeId?: number | null;
  employeeName?: string | null;
  isOnline: boolean;
  shiftId?: string | null;
  isReturn?: boolean;
  cashierId?: string | null;
  cashierName?: string | null;
  managerId?: string | null;
  managerName?: string | null;
  loyaltyCustomerId?: string | null;
  loyaltyPhone?: string | null;
  loyaltyBalance?: number;
  pointsEarned?: number;
  pointsRedeemed?: number;
}

async function restockReturnedItems(
  sale: LocalSale,
  managerId: string,
): Promise<void> {
  const items = sale.lines
    .filter((line) => !line.isLocal && line.productId > 0)
    .map((line) => ({
      wcId: line.productId,
      qty:
        Math.abs(line.qty) *
        Math.max(1, Math.floor(Number(line.stockMultiplier) || 1)),
    }));

  if (items.length === 0) return;

  const response = await fetchWithTimeout(
    "/api/pos/restock",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, managerId }),
    },
    CHECKOUT_FETCH_TIMEOUT_MS,
  );

  if (!response.ok) {
    const body = (await response.json()) as { error?: string };
    throw new Error(body.error ?? "Could not restock returned items");
  }
}

/**
 * Offline-first checkout:
 * 1. Persist sale/return to IndexedDB immediately
 * 2. ERP /api/checkout with hard timeout (never hang the dialog)
 * 3. WooCommerce sync in background — never blocks UI
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
        employeeId = null,
        employeeName = null,
        isOnline,
        shiftId,
        isReturn = false,
        cashierId = null,
        cashierName = null,
        managerId = null,
        managerName = null,
        loyaltyCustomerId = null,
        loyaltyPhone = null,
        loyaltyBalance = 0,
        pointsEarned = 0,
        pointsRedeemed = 0,
      } = input;

      if (lines.length === 0) return null;
      if (isReturn && !managerId) {
        setError("Manager authorization required for returns");
        return null;
      }

      setIsSubmitting(true);
      setError(null);

      try {
        const saleLines = cartToSaleLines(lines);
        const staffMeal = isStaffMealPayment(paymentMethod);
        const absTotal = roundMoney(Math.abs(total));
        const change =
          !isReturn && isCashPayment(paymentMethod)
            ? roundMoney(Math.max(0, tendered - total))
            : 0;
        const mealEmployeeId =
          staffMeal && employeeId != null && Number(employeeId) > 0
            ? Number(employeeId)
            : null;
        const mealEmployee = employeeName?.trim() || null;

        const sale: LocalSale = {
          id: newSaleId(),
          createdAt: new Date().toISOString(),
          paymentMethod,
          customerId: staffMeal ? null : (customer?.id ?? null),
          customerName: staffMeal
            ? "Staff meal"
            : customer
              ? `${customer.first_name} ${customer.last_name}`.trim() ||
                customer.email
              : "Walk-in",
          employeeId: mealEmployeeId,
          employeeName: staffMeal ? mealEmployee : null,
          lines: saleLines,
          total: isReturn ? -absTotal : staffMeal ? 0 : total,
          tendered: staffMeal
            ? 0
            : isCashPayment(paymentMethod)
              ? isReturn
                ? absTotal
                : tendered
              : absTotal,
          change: staffMeal ? 0 : change,
          wooOrderId: null,
          syncStatus: "pending",
          shiftId: shiftId ?? null,
          isReturn,
          cashierId,
          cashierName,
          managerId,
          managerName,
        };

        if (loyaltyCustomerId && loyaltyPhone) {
          sale.loyalty = {
            phone: loyaltyPhone,
            pointsEarned,
            pointsRedeemed,
            discountAmount: pointsRedeemed / 1000,
            pointsBalance: Math.max(
              0,
              loyaltyBalance - pointsRedeemed + pointsEarned,
            ),
          };
        }

        await saveSale(sale);

        if (!isOnline) {
          setLastSale(sale);
          return sale;
        }

        try {
          const checkoutRes = await fetchWithTimeout(
            "/api/checkout",
            {
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
                employeeId: sale.employeeId ?? null,
                customerId: loyaltyCustomerId,
                pointsEarned,
                pointsRedeemed,
                lines: saleLines.map((line) => ({
                  productId: line.productId,
                  name: line.name,
                  nameZh: line.nameZh ?? null,
                  qty: line.qty,
                  unitPrice: line.unitPrice,
                  lineTotal: line.lineTotal,
                  stockMultiplier: line.stockMultiplier ?? 1,
                })),
              }),
            },
            CHECKOUT_FETCH_TIMEOUT_MS,
          );
          if (!checkoutRes.ok) {
            const body = (await checkoutRes.json().catch(() => ({}))) as {
              error?: string;
            };
            const queued: LocalSale = {
              ...sale,
              syncStatus: "pending",
              syncError:
                body.error ?? "Checkout will retry when the server is available",
            };
            await saveSale(queued);
            setLastSale(queued);
            return queued;
          }
          const saved = (await checkoutRes.json()) as {
            orderNumber?: string | null;
            customer?: {
              phone?: string;
              pointsBalance?: number;
            } | null;
          };
          if (saved.orderNumber) sale.orderNumber = saved.orderNumber;
          if (loyaltyCustomerId && loyaltyPhone) {
            sale.loyalty = {
              phone: saved.customer?.phone || loyaltyPhone,
              pointsEarned,
              pointsRedeemed,
              discountAmount: pointsRedeemed / 1000,
              pointsBalance:
                typeof saved.customer?.pointsBalance === "number"
                  ? saved.customer.pointsBalance
                  : Math.max(0, loyaltyBalance - pointsRedeemed + pointsEarned),
            };
          }
        } catch (err) {
          console.warn("[checkout] sale persist error", err);
          const queued: LocalSale = {
            ...sale,
            syncStatus: "pending",
            syncError:
              err instanceof Error && err.name === "AbortError"
                ? "Server timeout — saved offline, will sync"
                : isNetworkError(err)
                  ? "Offline — will sync when online"
                  : err instanceof Error
                    ? err.message
                    : "Could not reach the server",
          };
          await saveSale(queued);
          setLastSale(queued);
          return queued;
        }

        if (isReturn) {
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
          }
        }

        if (staffMeal) {
          const synced: LocalSale = {
            ...sale,
            syncStatus: "synced",
            syncError: undefined,
          };
          await saveSale(synced);
          setLastSale(synced);
          return synced;
        }

        // Unblock UI immediately — WooCommerce continues in the background.
        await saveSale(sale);
        setLastSale(sale);

        void syncSaleToWooCommerce(sale)
          .then(async (synced) => {
            setLastSale(synced);
          })
          .catch(async (err) => {
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
          });

        return sale;
      } catch (err) {
        console.error("[checkout] unexpected", err);
        setError(
          err instanceof Error ? err.message : "Could not complete sale",
        );
        return null;
      } finally {
        // Guaranteed — dialog never stays on "جاري الإتمام…"
        setIsSubmitting(false);
      }
    },
    [],
  );

  return { completeSale, isSubmitting, error, lastSale, setError };
}
