const egp = new Intl.NumberFormat("en-EG", {
  style: "currency",
  currency: "EGP",
  minimumFractionDigits: 2,
});

export function formatEGP(amount: number): string {
  return egp.format(Number.isFinite(amount) ? amount : 0);
}

export function parsePrice(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** Weight and piece quantities, kept to grams (3 decimal places). */
export function roundQty(value: number): number {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

/** 1 stays "1"; 0.650 stays "0.65". */
export function formatQty(qty: number): string {
  const abs = Math.abs(Number(qty) || 0);
  const text = Number.isInteger(abs)
    ? String(abs)
    : abs.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return qty < 0 ? `-${text}` : text;
}

/**
 * Unit price for standard (non-scale) POS lines.
 * Uses sale_price when present and > 0; otherwise regular/catalog price.
 * Weighed scale lines use this as the price per kilogram. The barcode total is the line total.
 */
export function getCatalogSellingPrice(product: {
  price: string | number;
  regular_price?: string | number;
  sale_price?: string | number | null;
}): number {
  const sale = parsePrice(product.sale_price);
  if (sale > 0) return sale;
  const regular = parsePrice(product.regular_price ?? product.price);
  return regular;
}
