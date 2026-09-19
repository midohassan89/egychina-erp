import type { CachedProduct, WooCommerceMetaData } from "@/types/woocommerce";
import { normalizeBarcode } from "./parseScaleBarcode";

/** OpenPOS / store custom barcode meta key (not WooCommerce SKU). */
export const OP_BARCODE_META_KEY = "_op_barcode";

/**
 * Extract all barcode strings stored on a product's `_op_barcode` meta field.
 * OpenPOS may store a single value, comma/pipe-separated list, or a JSON array.
 */
export function getOpBarcodes(product: CachedProduct): string[] {
  const rows = product.meta_data ?? [];
  const values: string[] = [];

  for (const row of rows) {
    if (!isOpBarcodeMeta(row)) continue;
    values.push(...parseMetaBarcodeValue(row.value));
  }

  return values;
}

export function productHasOpBarcode(
  product: CachedProduct,
  scanned: string,
): boolean {
  const digits = normalizeBarcode(scanned);
  const raw = scanned.trim();
  if (!digits && !raw) return false;

  return getOpBarcodes(product).some((code) => {
    const codeDigits = normalizeBarcode(code);
    const codeRaw = code.trim();
    return (
      codeRaw === raw ||
      (digits.length > 0 && codeDigits === digits) ||
      // PLU stored without leading zeros vs padded scale PLU
      (digits.length > 0 && codeDigits === digits.replace(/^0+/, "")) ||
      (digits.length > 0 && codeDigits.padStart(5, "0") === digits.padStart(5, "0"))
    );
  });
}

/**
 * Find a product whose `_op_barcode` meta exactly matches the scanned code.
 * SKU is intentionally not used — barcodes live only in meta.
 */
export function findProductByOpBarcode(
  products: CachedProduct[],
  scanned: string,
): CachedProduct | undefined {
  return products.find((p) => productHasOpBarcode(p, scanned));
}

/**
 * Exact `_op_barcode` match for a scale PLU (e.g. "80024").
 * Tries padded and unpadded forms only — no fuzzy endsWith matching.
 */
export function findProductByExactPlu(
  products: CachedProduct[],
  pluPadded: string,
): CachedProduct | undefined {
  const plu = pluPadded.replace(/^0+/, "") || "0";
  const candidates = [pluPadded, plu, plu.padStart(5, "0")];

  return products.find((product) =>
    getOpBarcodes(product).some((code) => {
      const digits = normalizeBarcode(code);
      const raw = code.trim();
      return candidates.some(
        (c) => raw === c || digits === c || digits === normalizeBarcode(c),
      );
    }),
  );
}

function isOpBarcodeMeta(row: WooCommerceMetaData): boolean {
  return row.key === OP_BARCODE_META_KEY || row.key === "op_barcode";
}

function parseMetaBarcodeValue(
  value: WooCommerceMetaData["value"],
): string[] {
  if (value == null || value === "") return [];

  if (Array.isArray(value)) {
    return value.flatMap((v) => parseMetaBarcodeValue(v));
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }

  const text = String(value).trim();
  if (!text) return [];

  if (text.startsWith("[") || text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.flatMap((v) => parseMetaBarcodeValue(v as string));
      }
      if (parsed && typeof parsed === "object") {
        return Object.values(parsed as Record<string, unknown>).flatMap((v) =>
          parseMetaBarcodeValue(v as string),
        );
      }
    } catch {
      // fall through to delimiter split
    }
  }

  return text
    .split(/[,;|\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}
