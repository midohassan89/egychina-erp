export const ADJUSTMENT_TYPES = [
  {
    id: "WASTAGE",
    labelAr: "تالف/هالك",
    labelEn: "Wastage",
  },
  {
    id: "EXPIRED",
    labelAr: "منتهي الصلاحية",
    labelEn: "Expired",
  },
  {
    id: "LOSS",
    labelAr: "عجز جرد",
    labelEn: "Inventory shortage",
  },
  {
    id: "PRODUCTION_USE",
    labelAr: "استخدام للتصنيع",
    labelEn: "Production use",
  },
  {
    id: "MANUAL_COUNT",
    labelAr: "تعديل جرد",
    labelEn: "Manual count",
  },
] as const;

export type AdjustmentTypeId = (typeof ADJUSTMENT_TYPES)[number]["id"];

export function isAdjustmentType(value: string): value is AdjustmentTypeId {
  return ADJUSTMENT_TYPES.some((t) => t.id === value);
}

export function adjustmentTypeLabel(type: string): string {
  const found = ADJUSTMENT_TYPES.find((t) => t.id === type);
  if (!found) return type;
  return found.labelAr;
}
