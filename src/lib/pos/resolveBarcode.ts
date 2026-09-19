import type { CachedProduct } from "@/types/woocommerce";
import type { BarcodeScanResult } from "@/types/pos";
import { findProductByExactPlu, findProductByOpBarcode } from "./opBarcode";
import { productFromScalePlu } from "./scaleCatalog";
import { parsePrice, roundMoney } from "./money";

/**
 * Resolve a barcode typed/scanned into the search box (Enter to submit).
 *
 * Scale (13 digits, starts with 20): PLU + embedded price → cart with custom total.
 * Otherwise: exact `_op_barcode` match → cart qty 1.
 */
export function resolveScannedBarcode(
  rawInput: string,
  products: CachedProduct[],
): BarcodeScanResult | { error: string } {
  const code = rawInput.trim();
  if (!code) {
    return { error: "Empty barcode" };
  }

  // TASK 2: Scale barcode — exactly 13 digits starting with "20"
  if (/^\d{13}$/.test(code) && code.startsWith("20")) {
    return resolveScaleBarcode(code, products);
  }

  // TASK 3: Standard barcode — exact `_op_barcode` match
  const digits = code.replace(/\D/g, "");
  const lookup = digits.length >= 8 ? digits : code;
  const product = findProductByOpBarcode(products, lookup);

  if (!product) {
    return {
      error: `Product not found for barcode ${lookup} (checked _op_barcode)`,
    };
  }

  const unitPrice = parsePrice(product.price);
  return {
    barcode: lookup,
    product,
    qty: 1,
    unitPrice,
    lineTotal: roundMoney(unitPrice),
    isWeighted: false,
  };
}

/**
 * Format: 20 + PPPPP (PLU) + PPPPP (price) + C
 * Example: 2080024026130
 *   .substring(2, 7)  → "80024" (PLU)
 *   .substring(7, 12) → "02613" → 26.13 EGP
 */
function resolveScaleBarcode(
  code: string,
  products: CachedProduct[],
): BarcodeScanResult | { error: string } {
  const plu = code.substring(2, 7);
  const priceRaw = code.substring(7, 12);
  const lineTotal = roundMoney(parseInt(priceRaw, 10) / 100);

  if (lineTotal <= 0) {
    return { error: "Scale barcode has zero price" };
  }

  const product =
    findProductByExactPlu(products, plu) ??
    productFromScalePlu(plu) ??
    undefined;

  if (!product) {
    return {
      error: `Unknown PLU ${plu} — no product with _op_barcode matching this PLU`,
    };
  }

  return {
    barcode: code,
    product,
    qty: 1,
    unitPrice: lineTotal,
    lineTotal,
    isWeighted: true,
    isScalePriced: true,
    plu,
  };
}
