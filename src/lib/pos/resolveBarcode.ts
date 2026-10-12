import type { CachedProduct } from "@/types/woocommerce";
import type { BarcodeScanResult } from "@/types/pos";
import { findProductByExactPlu, findProductByOpBarcode } from "./opBarcode";
import { productFromScalePlu } from "./scaleCatalog";
import { getCatalogSellingPrice, parsePrice, roundMoney, roundQty } from "./money";

/** In-store scale labels: prefix + 5-digit PLU + 5-digit price (cents) + check digit. */
const SCALE_PREFIXES = ["20", "21", "23"];

function isScaleBarcode(code: string): boolean {
  return (
    /^\d{13}$/.test(code) && SCALE_PREFIXES.some((prefix) => code.startsWith(prefix))
  );
}

/**
 * Resolve a barcode typed/scanned into the search box (Enter to submit).
 *
 * Scale (13 digits, prefix 20/21/23): PLU + embedded total price.
 * Weighed products convert that total into kilograms using the catalog unit price.
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

  if (isScaleBarcode(code)) {
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
 * Format: PP + PPPPP (PLU) + PPPPP (price in cents) + C
 * Example: 2080024026130
 *   .substring(2, 7)  → "80024" (PLU)
 *   .substring(7, 12) → "02613" → 26.13 EGP
 * Weight = embedded total / catalog price per kilogram.
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

  if (product.isWeighed) {
    const unitPrice = getCatalogSellingPrice(product);
    if (unitPrice <= 0) {
      return { error: `Weighed product ${product.name} has no unit price` };
    }
    const qty = roundQty(lineTotal / unitPrice);
    if (qty <= 0) {
      return { error: "Scale barcode has zero weight" };
    }
    return {
      barcode: code,
      product,
      qty,
      unitPrice,
      lineTotal,
      isWeighted: true,
      isScalePriced: true,
      weightKg: qty,
      plu,
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
