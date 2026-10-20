import { getOpBarcodes } from "@/lib/pos/opBarcode";
import { normalizeBarcode } from "@/lib/pos/parseScaleBarcode";
import type { CachedProduct } from "@/types/woocommerce";

/** O(1) barcode / SKU lookup for the cashier search box. */
export function buildBarcodeMap(
  products: CachedProduct[],
): Map<string, CachedProduct> {
  const map = new Map<string, CachedProduct>();

  const set = (key: string, product: CachedProduct) => {
    const raw = key.trim();
    if (!raw) return;
    if (!map.has(raw)) map.set(raw, product);
    const digits = normalizeBarcode(raw);
    if (digits && !map.has(digits)) map.set(digits, product);
  };

  for (const product of products) {
    for (const code of getOpBarcodes(product)) set(code, product);
    if (product.sku) set(product.sku, product);
  }
  return map;
}

export function lookupBarcodeMap(
  map: Map<string, CachedProduct>,
  scanned: string,
): CachedProduct | undefined {
  const raw = scanned.trim();
  if (!raw) return undefined;
  return map.get(raw) ?? map.get(normalizeBarcode(raw));
}
