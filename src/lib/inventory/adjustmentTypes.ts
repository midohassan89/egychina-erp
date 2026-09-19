export const ADJUSTMENT_TYPES = [
  {
    id: "WASTAGE",
    labelAr: "الهالك",
    labelEn: "Wastage",
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
    labelAr: "جرد يدوي",
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
  return `${found.labelAr} / ${found.labelEn}`;
}
