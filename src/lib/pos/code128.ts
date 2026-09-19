/**
 * Code 128-B barcode → inline SVG (no external deps).
 * Patterns are standard GS1 / ISO 15417 binary module strings.
 */

const CODE128_BARS: string[] = [
  "11011001100","11001101100","11001100110","10010011000","10010001100",
  "10001001100","10011001000","10011000100","10001100100","11001001000",
  "11001000100","11000100100","10110011100","10011011100","10011001110",
  "10111001100","10011101100","10011100110","11001110010","11001011100",
  "11001001110","11011100100","11001110100","11101101110","11101001100",
  "11100101100","11100100110","11101100100","11100110100","11100110010",
  "11011011000","11011000110","11000110110","10100011000","10001011000",
  "10001000110","10110001000","10001101000","10001100010","11010001000",
  "11000101000","11000100010","10110111000","10110001110","10001101110",
  "10111011000","10111000110","10001110110","11101110110","11010001110",
  "11000101110","11011101000","11011100010","11011101110","11101011000",
  "11101000110","11100010110","11101101000","11101100010","11100011010",
  "11101111010","11001000010","11110001010","10100110000","10100001100",
  "10010110000","10010000110","10000101100","10000100110","10110010000",
  "10110000100","10011010000","10011000010","10000110100","10000110010",
  "11000010010","11001010000","11110111010","11000010100","10001111010",
  "10100111100","10010111100","10010011110","10111100100","10011110100",
  "10011110010","11110100100","11110010100","11110010010","11011011110",
  "11011110110","11110110110","10101111000","10100011110","10001011110",
  "10111101000","10111100010","11110101000","11110100010","10111011110",
  "10111101110","11101011110","11110101110","11010000100","11010010000",
  "11010011100","11000111010",
];

const START_B = 104;
const STOP = 106;

function encode(text: string): number[] {
  const safe = Array.from(text)
    .map((ch) => {
      const c = ch.charCodeAt(0);
      return c >= 32 && c <= 126 ? ch : "?";
    })
    .join("")
    .slice(0, 40);

  const values = [START_B];
  let checksum = START_B;

  for (let i = 0; i < safe.length; i++) {
    const v = safe.charCodeAt(i) - 32;
    values.push(v);
    checksum += v * (i + 1);
  }

  values.push(checksum % 103);
  values.push(STOP);
  return values;
}

export function buildCode128Svg(
  text: string,
  options: { height?: number; moduleWidth?: number } = {},
): string {
  const height = options.height ?? 36;
  const mw = options.moduleWidth ?? 1.15;
  const values = encode(text || "0");

  let x = mw * 10; // quiet zone
  const rects: string[] = [];

  for (const value of values) {
    const pattern = CODE128_BARS[value] ?? CODE128_BARS[0]!;
    for (let i = 0; i < pattern.length; i++) {
      const bit = pattern[i];
      if (bit === "1") {
        rects.push(
          `<rect x="${x.toFixed(2)}" y="0" width="${mw}" height="${height}" fill="#000"/>`,
        );
      }
      x += mw;
    }
  }

  x += mw * 10;
  const width = Math.ceil(x);

  const label = text.replace(/[<>&"]/g, "");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height + 14}" viewBox="0 0 ${width} ${height + 14}">`,
    ...rects,
    `<text x="${width / 2}" y="${height + 11}" text-anchor="middle" font-size="9" font-family="monospace" fill="#000">${label}</text>`,
    `</svg>`,
  ].join("");
}

/** Prefer WooCommerce order number; fall back to a compact local sale id. */
export function receiptBarcodeValue(sale: {
  id: string;
  wooOrderId: number | null;
}): string {
  if (sale.wooOrderId != null) {
    return String(sale.wooOrderId);
  }
  // Compact local id for offline receipts
  return sale.id.replace(/-/g, "").slice(0, 12).toUpperCase();
}
