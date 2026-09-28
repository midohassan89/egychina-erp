/** Digits only. A 12-digit 201… code becomes the local 01… mobile. */
export function normalizeLoyaltyPhone(raw: string): string {
  let cleanPhone = raw.replace(/\D/g, "");
  if (cleanPhone.startsWith("201") && cleanPhone.length === 12) {
    cleanPhone = cleanPhone.replace(/^2/, "0");
  }
  return cleanPhone;
}

/** Loyalty card: Egyptian mobile, exactly 11 digits starting with 01. */
export function isCustomerLoyaltyScan(raw: string): boolean {
  const code = normalizeLoyaltyPhone(raw);
  return code.startsWith("01") && code.length === 11;
}
