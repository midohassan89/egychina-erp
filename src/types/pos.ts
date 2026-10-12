import type { CachedProduct } from "@/types/woocommerce";
import { roundMoney } from "@/lib/pos/money";

export type LineDiscountType = "percent" | "flat";

export interface CartLine {
  lineId: string;
  product: CachedProduct;
  /**
   * Pieces, or kilograms for a weighed scale item.
   * The scale barcode does not contain the weight; it is total ÷ unit price.
   */
  qty: number;
  /**
   * Unit price for this cart row.
   * Weighed scale lines keep the catalog price per kilogram.
   * May be overridden by the cashier via Edit Item.
   */
  unitPrice: number;
  /** Line subtotal charged to the customer (after discount). */
  lineTotal: number;
  /**
   * True for scale-barcode lines. Quantity is the calculated weight and is not stepped by ±1.
   */
  isScalePriced: boolean;
  /** @deprecated use isScalePriced — kept for compatibility */
  isWeighted: boolean;
  weightKg?: number;
  barcode?: string;
  plu?: string;
  /** Optional line discount applied after qty × unitPrice. */
  discountType?: LineDiscountType | null;
  discountValue?: number;
}

export function computeLineTotal(
  qty: number,
  unitPrice: number,
  discountType?: LineDiscountType | null,
  discountValue?: number,
): number {
  const absQty = Math.abs(qty);
  const absPrice = Math.abs(unitPrice);
  const isReturn = qty < 0 || unitPrice < 0;
  let sub = absQty * absPrice;

  if (discountType && discountValue != null && discountValue > 0) {
    if (discountType === "percent") {
      const pct = Math.min(100, Math.max(0, discountValue));
      sub = sub * (1 - pct / 100);
    } else {
      sub = Math.max(0, sub - discountValue);
    }
  }

  const total = roundMoney(sub);
  return isReturn ? -total : total;
}

export type ScaleValueType = "weight" | "price";

export interface ParsedScaleBarcode {
  raw: string;
  prefix: string;
  plu: string;
  pluPadded: string;
  valueType: ScaleValueType;
  weightKg: number | null;
  embeddedPrice: number | null;
  checkDigit: string | null;
  checkDigitValid: boolean;
}

export interface BarcodeScanResult {
  barcode: string;
  product: CachedProduct;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  isWeighted: boolean;
  isScalePriced?: boolean;
  weightKg?: number;
  plu?: string;
}
