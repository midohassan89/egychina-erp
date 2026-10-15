/**
 * Generate a random 13-digit barcode starting with "99"
 * (avoids scale prefixes 20/21/23).
 */
export function generateErpBarcode(): string {
  let digits = "99";
  for (let i = 0; i < 11; i += 1) {
    digits += String(Math.floor(Math.random() * 10));
  }
  return digits;
}

export async function checkBarcodeAvailable(
  barcode: string,
): Promise<{ available: boolean; error?: string }> {
  const normalized = barcode.trim();
  if (!normalized) {
    return { available: false, error: "الباركود مطلوب" };
  }

  const res = await fetch(
    `/api/products/check-barcode?barcode=${encodeURIComponent(normalized)}`,
  );
  const data = (await res.json()) as {
    available?: boolean;
    error?: string;
  };
  if (!res.ok) {
    return { available: false, error: data.error ?? "تعذر التحقق من الباركود" };
  }
  return { available: Boolean(data.available) };
}

/**
 * Keep generating until local DB reports the barcode as free (max attempts).
 */
export async function generateUniqueErpBarcode(
  maxAttempts = 12,
): Promise<string> {
  for (let i = 0; i < maxAttempts; i += 1) {
    const candidate = generateErpBarcode();
    const { available } = await checkBarcodeAvailable(candidate);
    if (available) return candidate;
  }
  throw new Error("تعذر توليد باركود فريد. أعد المحاولة");
}
