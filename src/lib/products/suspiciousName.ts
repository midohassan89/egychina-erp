/** Catalog titles that look like barcode-scraper junk, not shelf names. */
const PATTERNS: RegExp[] = [
  /upc\s*lookup/i,
  /ean\s*lookup/i,
  /barcode\s*lookup/i,
  /buycott(?:\.com)?/i,
  /ean\s*harvest/i,
  /openfoodfacts/i,
  /duckduckgo/i,
];

export function isSuspiciousProductName(name: string | null | undefined): boolean {
  const trimmed = (name ?? "").replace(/\s+/g, " ").trim();
  if (trimmed.length < 2) return true;
  if (PATTERNS.some((pattern) => pattern.test(trimmed))) return true;
  if (/^[\d\s\-]+$/.test(trimmed) && trimmed.replace(/\D/g, "").length >= 8) return true;
  return false;
}

/** Prisma `OR` clauses for admin listing (SQLite LIKE / contains). */
export function suspiciousNamePrismaOr(): Array<{ name: { contains: string } }> {
  return [
    { name: { contains: "Buycott" } },
    { name: { contains: "buycott" } },
    { name: { contains: "UPC Lookup" } },
    { name: { contains: "upc lookup" } },
    { name: { contains: "EAN Lookup" } },
    { name: { contains: "EAN Harvest" } },
    { name: { contains: "Barcode Lookup" } },
    { name: { contains: "OpenFoodFacts" } },
  ];
}
