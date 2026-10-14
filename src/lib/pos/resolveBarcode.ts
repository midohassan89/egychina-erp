import type { CachedProduct } from "@/types/woocommerce";
import type { BarcodeScanResult } from "@/types/pos";
import { getOpBarcodes } from "./opBarcode";
import { getCatalogSellingPrice, parsePrice, roundMoney, roundQty } from "./money";

/** In-store scale labels: 20 + 5-digit PLU + 5-digit price (cents) + check digit. */
const SCALE_PREFIX = "20";
const NOT_FOUND = "المنتج غير متوفر";

export function isScaleBarcode(code: string): boolean {
  const digits = code.replace(/\D/g, "");
  return digits.length === 13 && digits.startsWith(SCALE_PREFIX);
}

function looseCode(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.replace(/^0+/, "") || digits;
}

/** Match a PLU or barcode against sku and stored barcodes only — never a longer code. */
function findProductByCode(
  products: CachedProduct[],
  code: string,
): CachedProduct | undefined {
  const raw = code.trim();
  const loose = looseCode(raw);
  if (!raw) return undefined;

  return products.find((product) => {
    const stored = [product.sku ?? "", ...getOpBarcodes(product)];
    return stored.some((value) => {
      const text = value.trim();
      if (!text) return false;
      return text === raw || (loose.length > 0 && looseCode(text) === loose);
    });
  });
}

/**
 * Resolve a barcode typed/scanned into the search box (Enter to submit).
 *
 * Scale (13 digits starting with 20): PLU + embedded total price.
 * The prefix alone selects this path. The product's isWeighed flag is not consulted.
 * Weight = embedded total / catalog unit price.
 * Otherwise: exact barcode match → cart qty 1.
 */
export function resolveScannedBarcode(
  rawInput: string,
  products: CachedProduct[],
): BarcodeScanResult | { error: string } {
  try {
    const code = rawInput.trim();
    if (!code) {
      return { error: "Empty barcode" };
    }

    const catalog = Array.isArray(products) ? products : [];
    const digits = code.replace(/\D/g, "");

    if (isScaleBarcode(digits)) {
      return resolveScaleBarcode(digits, catalog);
    }

    const product = findProductByCode(catalog, digits.length >= 8 ? digits : code);
    if (!product) {
      return { error: NOT_FOUND };
    }

    const unitPrice = getCatalogSellingPrice(product) || parsePrice(product.price);
    return {
      barcode: digits || code,
      product,
      qty: 1,
      unitPrice,
      lineTotal: roundMoney(unitPrice),
      isWeighted: false,
    };
  } catch (error) {
    console.error("[pos] barcode resolve failed", error);
    return { error: NOT_FOUND };
  }
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
  const itemCode = code.substring(2, 7);
  const totalPrice = roundMoney(parseFloat(code.substring(7, 12)) / 100);

  if (!itemCode || !Number.isFinite(totalPrice) || totalPrice <= 0) {
    return { error: NOT_FOUND };
  }

  const product = findProductByCode(products, itemCode);
  if (!product) {
    return { error: NOT_FOUND };
  }

  const unitPrice = getCatalogSellingPrice(product) || parsePrice(product.price);
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    return { error: NOT_FOUND };
  }
  const calculatedQty = roundQty(totalPrice / unitPrice);
  if (!Number.isFinite(calculatedQty) || calculatedQty <= 0) {
    return { error: NOT_FOUND };
  }
  return {
    barcode: code,
    product,
    qty: calculatedQty,
    unitPrice,
    lineTotal: totalPrice,
    isWeighted: true,
    isScalePriced: true,
    weightKg: calculatedQty,
    plu: itemCode,
  };
}
