import type { PaymentMethod } from "@/types/woocommerce";

export const PAYMENT_METHOD_OPTIONS: {
  id: PaymentMethod;
  labelEn: string;
  labelAr: string;
}[] = [
  { id: "cash", labelEn: "Cash", labelAr: "كاش" },
  { id: "visa", labelEn: "Visa", labelAr: "فيزا" },
  { id: "wallet", labelEn: "Wallet", labelAr: "محفظة" },
  { id: "instapay", labelEn: "InstaPay", labelAr: "انستا باي" },
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

/** Arabic-only label for POS checkout buttons. */
export function paymentMethodLabelAr(method: PaymentMethod): string {
  const found = PAYMENT_METHOD_OPTIONS.find((m) => m.id === method);
  if (found) return found.labelAr;
  if ((method as string) === "card") return "فيزا";
  return String(method);
}

/** Arabic + Chinese label for bilingual thermal receipts. */
export function paymentMethodLabelArZh(method: PaymentMethod): string {
  switch (method) {
    case "cash":
      return "النقدية / 现金";
    case "visa":
    case "card":
      return "فيزا / 信用卡";
    case "wallet":
      return "محفظة / 电子钱包";
    case "instapay":
      return "انستا باي / InstaPay";
    case "wechat":
      return "وي شات / 微信支付";
    case "STAFF_MEAL":
      return "وجبات عمال / 员工餐";
    default:
      return String(method);
  }
}

export function isCashPayment(method: PaymentMethod): boolean {
  return method === "cash";
}

export function isStaffMealPayment(method: PaymentMethod | string): boolean {
  return method === "STAFF_MEAL";
}
