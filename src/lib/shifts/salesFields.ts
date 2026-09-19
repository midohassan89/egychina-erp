import type { PaymentMethod } from "@/types/woocommerce";

/** Prisma Shift sales column for a given POS payment method. */
export type ShiftSalesField =
  | "cashSales"
  | "visaSales"
  | "walletSales"
  | "instapaySales"
  | "wechatSales";

export function shiftSalesFieldForPayment(
  method: PaymentMethod | string,
): ShiftSalesField {
  switch (method) {
    case "cash":
      return "cashSales";
    case "visa":
    case "card": // legacy
      return "visaSales";
    case "wallet":
      return "walletSales";
    case "instapay":
      return "instapaySales";
    case "wechat":
      return "wechatSales";
    default:
      return "cashSales";
  }
}

export function sumShiftSales(parts: {
  cashSales?: number;
  visaSales?: number;
  walletSales?: number;
  instapaySales?: number;
  wechatSales?: number;
}): number {
  return (
    (parts.cashSales ?? 0) +
    (parts.visaSales ?? 0) +
    (parts.walletSales ?? 0) +
    (parts.instapaySales ?? 0) +
    (parts.wechatSales ?? 0)
  );
}
