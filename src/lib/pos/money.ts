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

/**
 * Unit price for standard (non-scale) POS lines.
 * Uses sale_price when present and > 0; otherwise regular/catalog price.
 * Scale barcode lines must NOT use this — they keep the barcode-extracted total.
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
