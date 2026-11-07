/** Digits only. A 12-digit 201… code becomes the local 01… mobile. */
export function normalizeLoyaltyPhone(raw: string): string {
  let cleanPhone = raw.replace(/\D/g, "");
  // Country 20 + national 1xxxxxxxxx → local 01xxxxxxxxx (11 digits).
  if (cleanPhone.startsWith("201") && cleanPhone.length === 12) {
    cleanPhone = `0${cleanPhone.slice(2)}`;
  }
  return cleanPhone;
}

/** Loyalty card: Egyptian mobile, exactly 11 digits starting with 01. */
export function isCustomerLoyaltyScan(raw: string): boolean {
  const code = normalizeLoyaltyPhone(raw);
  return code.startsWith("01") && code.length === 11;
}
