import type { PaymentMethod } from "@/types/woocommerce";

export const PAYMENT_METHOD_OPTIONS: {
  id: PaymentMethod;
  labelEn: string;
  labelAr: string;
}[] = [
  { id: "cash", labelEn: "Cash", labelAr: "كاش" },
  { id: "visa", labelEn: "Visa", labelAr: "فيزا" },
  { id: "wallet", labelEn: "Wallet", labelAr: "محفظة" },
  { id: "instapay", labelEn: "InstaPay", labelAr: "انستا" },
  { id: "wechat", labelEn: "WeChat", labelAr: "وي شات" },
  { id: "STAFF_MEAL", labelEn: "Staff Meal", labelAr: "وجبات عمال" },
];

/** Bilingual label for receipts / UI. */
export function paymentMethodLabel(method: PaymentMethod): string {
  const found = PAYMENT_METHOD_OPTIONS.find((m) => m.id === method);
  if (found) return `${found.labelAr} / ${found.labelEn}`;
  // Legacy sales stored as "card"
  if ((method as string) === "card") return "بطاقة / Card";
  return String(method);
}

export function isCashPayment(method: PaymentMethod): boolean {
  return method === "cash";
}

export function isStaffMealPayment(method: PaymentMethod | string): boolean {
  return method === "STAFF_MEAL";
}
