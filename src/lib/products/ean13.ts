/**
 * EAN-13 helpers for ERP internal product codes and label printing.
 * Retail scanners prefer valid EAN-13 over dense CODE128 on tiny stickers.
 */

export function ean13Checksum(first12: string): number {
  if (!/^\d{12}$/.test(first12)) {
    throw new Error("EAN-13 body must be exactly 12 digits");
  }
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    const digit = Number(first12[i]);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  return (10 - (sum % 10)) % 10;
}

export function buildEan13(first12: string): string {
  const body = first12.replace(/\D/g, "").slice(0, 12).padStart(12, "0");
  return `${body}${ean13Checksum(body)}`;
}

export function isValidEan13(value: string): boolean {
  const digits = value.trim();
  if (!/^\d{13}$/.test(digits)) return false;
  return ean13Checksum(digits.slice(0, 12)) === Number(digits[12]);
}

/** Prefer EAN-13 only when the stored value already has a valid check digit. */
export function resolveLabelBarcodeFormat(
  value: string,
): "EAN13" | "CODE128" {
  return isValidEan13(value) ? "EAN13" : "CODE128";
}
