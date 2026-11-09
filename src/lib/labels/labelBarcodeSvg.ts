import { resolveLabelBarcodeFormat } from "@/lib/products/ean13";
import {
  buildCode128Svg,
  estimateCode128Modules,
} from "@/lib/pos/code128";
import { buildEan13Svg } from "@/lib/pos/ean13Svg";

/** EAN-13 payload is 95 modules; quiet zones typically 7 each side. */
const EAN13_MODULES = 95;

export function buildLabelBarcodeSvg(
  barcode: string,
  options: {
    height: number;
    /** Available draw width in SVG units (≈ CSS px). */
    maxWidth: number;
    compact?: boolean;
  },
): string {
  const value = barcode.trim();
  if (!value) return "";

  const format = resolveLabelBarcodeFormat(value);
  const quiet = format === "EAN13" ? 7 : 10;
  const payloadModules =
    format === "EAN13"
      ? EAN13_MODULES
      : estimateCode128Modules(value, 0);
  const totalModules = payloadModules + quiet * 2;
  // Keep modules thick enough for thermal heads (~0.33mm+ when printed).
  const fitted = options.maxWidth / Math.max(totalModules, 1);
  const moduleWidth = Math.max(options.compact ? 1.05 : 1.2, fitted);

  if (format === "EAN13") {
    return buildEan13Svg(value, {
      height: options.height,
      moduleWidth,
      quietModules: quiet,
    });
  }

  return buildCode128Svg(value, {
    height: options.height,
    moduleWidth,
    quietModules: quiet,
    displayValue: false,
  });
}

export type LabelBarcodeReactFormat = "EAN13" | "CODE128";

export function labelBarcodeReactProps(barcode: string): {
  value: string;
  format: LabelBarcodeReactFormat;
  /** react-barcode quiet-zone related margin (px). */
  margin: number;
  width: number;
} {
  const value = barcode.trim();
  const format = resolveLabelBarcodeFormat(value);
  return {
    value,
    format,
    margin: format === "EAN13" ? 8 : 10,
    // Slightly wider modules on preview; CSS will contain them.
    width: format === "EAN13" ? 1.7 : 1.55,
  };
}
