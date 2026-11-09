/**
 * EAN-13 → inline SVG (no external deps).
 * Module patterns follow GS1 EAN-13.
 */

const L_CODES = [
  "0001101",
  "0011001",
  "0010011",
  "0111101",
  "0100011",
  "0110001",
  "0101111",
  "0111011",
  "0110111",
  "0001011",
];

const G_CODES = [
  "0100111",
  "0110011",
  "0011011",
  "0100001",
  "0011101",
  "0111001",
  "0000101",
  "0010001",
  "0001001",
  "0010111",
];

const R_CODES = [
  "1110010",
  "1100110",
  "1101100",
  "1000010",
  "1011100",
  "1001110",
  "1010000",
  "1000100",
  "1001000",
  "1110100",
];

/** First-digit parity pattern for the six left digits (L or G). */
const FIRST_DIGIT_PARITY = [
  "LLLLLL",
  "LLGLGG",
  "LLGGLG",
  "LLGGGL",
  "LGLLGG",
  "LGGLLG",
  "LGGGLL",
  "LGLGLG",
  "LGLGGL",
  "LGGLGL",
];

function appendPattern(
  bits: string,
  mw: number,
  height: number,
  startX: number,
): { x: number; rects: string[] } {
  let x = startX;
  const rects: string[] = [];
  for (const bit of bits) {
    if (bit === "1") {
      rects.push(
        `<rect x="${x.toFixed(2)}" y="0" width="${mw}" height="${height}" fill="#000"/>`,
      );
    }
    x += mw;
  }
  return { x, rects };
}

export function buildEan13Svg(
  text: string,
  options: {
    height?: number;
    moduleWidth?: number;
    quietModules?: number;
  } = {},
): string {
  const digits = text.trim();
  if (!/^\d{13}$/.test(digits)) {
    throw new Error("EAN-13 SVG requires exactly 13 digits");
  }

  const height = options.height ?? 40;
  const quiet = options.quietModules ?? 7;
  const mw = options.moduleWidth ?? 1.2;
  const first = Number(digits[0]);
  const parity = FIRST_DIGIT_PARITY[first] ?? FIRST_DIGIT_PARITY[0]!;
  const left = digits.slice(1, 7);
  const right = digits.slice(7, 13);

  let x = mw * quiet;
  const rects: string[] = [];

  const start = appendPattern("101", mw, height, x);
  x = start.x;
  rects.push(...start.rects);

  for (let i = 0; i < 6; i += 1) {
    const d = Number(left[i]);
    const set = parity[i] === "G" ? G_CODES : L_CODES;
    const part = appendPattern(set[d]!, mw, height, x);
    x = part.x;
    rects.push(...part.rects);
  }

  const center = appendPattern("01010", mw, height, x);
  x = center.x;
  rects.push(...center.rects);

  for (let i = 0; i < 6; i += 1) {
    const d = Number(right[i]);
    const part = appendPattern(R_CODES[d]!, mw, height, x);
    x = part.x;
    rects.push(...part.rects);
  }

  const end = appendPattern("101", mw, height, x);
  x = end.x;
  rects.push(...end.rects);
  x += mw * quiet;

  const width = Math.max(1, Math.ceil(x));
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">`,
    ...rects,
    `</svg>`,
  ].join("");
}
