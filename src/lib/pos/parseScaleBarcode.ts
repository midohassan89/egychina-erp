import type { ParsedScaleBarcode } from "@/types/pos";

/**
 * Souq El Obour scale EAN-13 format (from real store receipts):
 *
 *   20 PPPPP PPPPP C
 *   │  │     │     └─ check digit
 *   │  │     └─────── 5-digit total price in piasters (÷ 100 → EGP)
 *   │  └───────────── 5-digit PLU / item code (matches `_op_barcode`)
 *   └──────────────── prefix (always "20")
 *
 * Example: 2080024026130
 *   Prefix: 20
 *   PLU:    80024
 *   Price:  02613 → 26.13 EGP
 */
export const SCALE_PREFIX = "20";

const PREFIX_LEN = 2;
const PLU_LEN = 5;
const PRICE_LEN = 5;

export function isScaleBarcode(code: string): boolean {
  const digits = normalizeBarcode(code);
  return (
    digits.length === 13 && digits.startsWith(SCALE_PREFIX)
  );
}

export function parseScaleBarcode(code: string): ParsedScaleBarcode | null {
  const raw = normalizeBarcode(code);

  // Must be exactly 13 digits starting with 20
  if (raw.length !== 13 || !raw.startsWith(SCALE_PREFIX)) {
    return null;
  }

  const prefix = raw.slice(0, PREFIX_LEN);
  // Digits 3–7 (1-based) → indices 2..6
  const pluPadded = raw.slice(PREFIX_LEN, PREFIX_LEN + PLU_LEN);
  // Digits 8–12 (1-based) → indices 7..11
  const priceDigits = raw.slice(
    PREFIX_LEN + PLU_LEN,
    PREFIX_LEN + PLU_LEN + PRICE_LEN,
  );
  const checkDigit = raw[12] ?? null;

  if (!/^\d{5}$/.test(pluPadded) || !/^\d{5}$/.test(priceDigits)) {
    return null;
  }

  const embeddedPrice = parseInt(priceDigits, 10) / 100;
  const checkDigitValid =
    checkDigit === null
      ? true
      : computeEan13CheckDigit(raw.slice(0, 12)) === checkDigit;

  return {
    raw,
    prefix,
    plu: stripLeadingZeros(pluPadded),
    pluPadded,
    valueType: "price",
    weightKg: null,
    embeddedPrice,
    checkDigit,
    checkDigitValid,
  };
}

export function computeEan13CheckDigit(first12: string): string {
  const digits = first12.replace(/\D/g, "");
  if (digits.length !== 12) return "";

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = Number(digits[i]);
    sum += i % 2 === 0 ? n : n * 3;
  }

  return String((10 - (sum % 10)) % 10);
}

export function normalizeBarcode(code: string): string {
  return code.replace(/\D/g, "");
}

function stripLeadingZeros(value: string): string {
  return value.replace(/^0+/, "") || "0";
}
