import { generateErpBarcode } from "../src/lib/products/barcode";
import {
  buildEan13,
  ean13Checksum,
  isValidEan13,
  resolveLabelBarcodeFormat,
} from "../src/lib/products/ean13";
import { estimateCode128Modules } from "../src/lib/pos/code128";
import { buildLabelBarcodeSvg } from "../src/lib/labels/labelBarcodeSvg";

const sample = "9914828627784"; // سبا سكر عادي — legacy random 13 digits
const expectedCheck = ean13Checksum(sample.slice(0, 12));

console.log("sample", sample);
console.log("valid EAN-13?", isValidEan13(sample));
console.log("expected check digit", expectedCheck, "actual", sample[12]);
console.log("print format", resolveLabelBarcodeFormat(sample));
console.log(
  "CODE128 modules (set C)",
  estimateCode128Modules(sample, 10),
);

const generated = generateErpBarcode();
console.log("new generated", generated, "valid?", isValidEan13(generated));
console.log("new format", resolveLabelBarcodeFormat(generated));
console.log("buildEan13(990000000001)", buildEan13("990000000001"));

const svgLegacy = buildLabelBarcodeSvg(sample, {
  height: 42,
  maxWidth: 380,
  compact: true,
});
const svgNew = buildLabelBarcodeSvg(generated, {
  height: 42,
  maxWidth: 380,
  compact: true,
});
console.log("legacy svg bytes", svgLegacy.length, "starts", svgLegacy.slice(0, 60));
console.log("new svg bytes", svgNew.length, "starts", svgNew.slice(0, 60));

if (isValidEan13(sample)) {
  throw new Error("sample should be invalid EAN-13 (legacy generator)");
}
if (!isValidEan13(generated)) {
  throw new Error("generator must produce valid EAN-13");
}
if (resolveLabelBarcodeFormat(sample) !== "CODE128") {
  throw new Error("legacy sample must print as CODE128");
}
if (resolveLabelBarcodeFormat(generated) !== "EAN13") {
  throw new Error("new codes must print as EAN13");
}

console.log("OK");
