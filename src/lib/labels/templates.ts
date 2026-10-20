/** Label paper templates for thermal barcode stickers. */
export type LabelTemplateId =
  | "standard-38x25"
  | "pharmacy-stack-38x25"
  | "pharmacy-side-38x25";

export type LabelTemplate = {
  id: LabelTemplateId;
  label: string;
  /** Physical sticker width in mm. */
  widthMm: number;
  /** Physical sticker height in mm. */
  heightMm: number;
  /** How many product faces are printed on one physical sticker. */
  facesPerSticker: number;
  /** CSS layout for faces inside one sticker. */
  layout: "single" | "stack" | "side";
};

export const LABEL_TEMPLATES: LabelTemplate[] = [
  {
    id: "standard-38x25",
    label: "ملصق قياسي مفرد (3.8 سم × 2.5 سم - 38×25mm)",
    widthMm: 38,
    heightMm: 25,
    facesPerSticker: 1,
    layout: "single",
  },
  {
    id: "pharmacy-stack-38x25",
    label:
      "ملصق صيدليات مقسوم نصفين - أفقي فوق بعض (3.8 سم × 2.5 سم مقسوم إلى ملصقين 38×12.5mm)",
    widthMm: 38,
    heightMm: 25,
    facesPerSticker: 2,
    layout: "stack",
  },
  {
    id: "pharmacy-side-38x25",
    label:
      "ملصق صيدليات مقسوم نصفين - رأسي بجانب بعض (3.8 سم × 2.5 سم مقسوم إلى ملصقين 19×25mm)",
    widthMm: 38,
    heightMm: 25,
    facesPerSticker: 2,
    layout: "side",
  },
];

export function getLabelTemplate(id: string | null | undefined): LabelTemplate {
  return (
    LABEL_TEMPLATES.find((item) => item.id === id) ?? LABEL_TEMPLATES[0]!
  );
}

/** Clamp sticker count — never fall back to 10 or any other default > 1. */
export function parseLabelCopies(raw: unknown, fallback = 1): number {
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n) || n < 1) return Math.max(1, Math.min(200, fallback));
  return Math.min(200, n);
}

export function formatLabelPrice(price: number): string {
  if (!Number.isFinite(price)) return "0.00 ج.م";
  return `${price.toFixed(2)} ج.م`;
}
