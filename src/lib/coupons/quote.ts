export interface CouponRecord {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
  minOrder: number;
  maxDiscount: number | null;
  usageLimit: number | null;
  usedCount: number;
  expiresAt: Date | null;
  isActive: boolean;
}

export interface CouponQuote {
  id: string;
  code: string;
  discountType: "PERCENTAGE" | "FIXED";
  discountValue: number;
  discountAmount: number;
}

export type CouponQuoteResult =
  | { ok: true; quote: CouponQuote }
  | { ok: false; error: string };

/** Price a coupon against a goods subtotal. Does not increment usedCount. */
export function quoteCoupon(
  coupon: CouponRecord | null,
  subtotal: number,
  now = new Date(),
): CouponQuoteResult {
  if (!coupon) return { ok: false, error: "Coupon not found" };
  if (!coupon.isActive) return { ok: false, error: "Coupon is inactive" };
  if (coupon.expiresAt && coupon.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, error: "Coupon has expired" };
  }
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
    return { ok: false, error: "Coupon usage limit reached" };
  }
  if (!Number.isFinite(subtotal) || subtotal < 0) {
    return { ok: false, error: "subtotal must be 0 or greater" };
  }
  if (subtotal + 0.001 < coupon.minOrder) {
    return { ok: false, error: "Order is below the coupon minimum" };
  }

  const discountType =
    coupon.discountType === "FIXED"
      ? "FIXED"
      : coupon.discountType === "PERCENTAGE"
        ? "PERCENTAGE"
        : null;
  if (!discountType) return { ok: false, error: "Coupon is invalid" };

  let amount =
    discountType === "PERCENTAGE"
      ? subtotal * (coupon.discountValue / 100)
      : coupon.discountValue;
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, error: "Coupon is invalid" };
  }
  if (coupon.maxDiscount != null && amount > coupon.maxDiscount) {
    amount = coupon.maxDiscount;
  }
  if (amount > subtotal) amount = subtotal;
  amount = Math.round(amount * 100) / 100;

  return {
    ok: true,
    quote: {
      id: coupon.id,
      code: coupon.code,
      discountType,
      discountValue: coupon.discountValue,
      discountAmount: amount,
    },
  };
}
