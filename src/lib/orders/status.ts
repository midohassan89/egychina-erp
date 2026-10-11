export const ORDER_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
  "PARTIALLY_RETURNED",
  "RETURNED",
  "CANCELLED",
] as const;

export type OrderStatusCode = (typeof ORDER_STATUSES)[number];

/** Statuses an admin may set by hand. Return statuses are applied when a return is completed. */
export const MANUAL_ORDER_STATUSES = ORDER_STATUSES.filter(
  (status) => status !== "PARTIALLY_RETURNED" && status !== "RETURNED",
);

export const ORDER_STATUS_LABELS: Record<OrderStatusCode, string> = {
  PENDING: "قيد الانتظار",
  CONFIRMED: "تم التأكيد",
  PREPARING: "جاري التحضير",
  SHIPPED: "مشحون",
  DELIVERED: "تم التسليم",
  COMPLETED: "مكتمل",
  PARTIALLY_RETURNED: "مرتجع جزئي",
  RETURNED: "مرتجع كلي",
  CANCELLED: "ملغي",
};

const LEGACY_STATUS: Record<string, OrderStatusCode> = {
  "قيد الانتظار": "PENDING",
  "جاري التجهيز": "PREPARING",
  "جاري التحضير": "PREPARING",
  مكتمل: "COMPLETED",
  "تم التسليم": "DELIVERED",
  ملغي: "CANCELLED",
};

export function isOrderStatus(value: string): value is OrderStatusCode {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

/** Accept enum codes and the older Arabic labels stored before the enum. */
export function normalizeOrderStatus(value: string): OrderStatusCode | null {
  const raw = value.trim();
  if (isOrderStatus(raw)) return raw;
  return LEGACY_STATUS[raw] ?? null;
}

export function orderStatusLabel(value: string): string {
  const code = normalizeOrderStatus(value);
  return code ? ORDER_STATUS_LABELS[code] : value;
}

export const CUSTOMER_CANCELLABLE = new Set<OrderStatusCode>([
  "PENDING",
  "CONFIRMED",
]);
