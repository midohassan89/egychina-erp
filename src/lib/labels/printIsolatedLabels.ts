import { buildCode128Svg } from "@/lib/pos/code128";
import {
  formatLabelPrice,
  type LabelTemplate,
} from "@/lib/labels/templates";

export type IsolatedLabel = {
  name: string;
  nameZh?: string | null;
  barcode: string;
  price: number;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function faceHtml(label: IsolatedLabel, compact: boolean): string {
  const name = escapeHtml(label.name);
  const zh = label.nameZh?.trim() ? escapeHtml(label.nameZh.trim()) : "";
  const svg = buildCode128Svg(label.barcode, {
    height: compact ? 22 : 32,
    moduleWidth: compact ? 1.5 : 2,
  });
  return `<div class="face">
    <p class="name">${name}</p>
    ${zh ? `<p class="name-zh" lang="zh-CN">${zh}</p>` : ""}
    <p class="price"><span>${escapeHtml(formatLabelPrice(label.price))}</span></p>
    <div class="barcode">${svg}</div>
  </div>`;
}

function stickerHtml(label: IsolatedLabel, template: LabelTemplate): string {
  if (template.layout === "single") {
    return `<section class="sticker">${faceHtml(label, false)}</section>`;
  }
  const klass = template.layout === "stack" ? "sticker stack" : "sticker side";
  return `<section class="${klass}">${faceHtml(label, true)}${faceHtml(label, true)}</section>`;
}

function documentHtml(labels: IsolatedLabel[], template: LabelTemplate): string {
  const pages = labels.map((label) => stickerHtml(label, template)).join("");
  return `<!DOCTYPE html>
<html lang="ar">
<head>
<meta charset="utf-8" />
<title>Barcode labels</title>
<style>
  @page { size: 38mm 25mm; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { width: 38mm; }
  .sticker {
    box-sizing: border-box;
    width: 38mm;
    height: 25mm;
    margin: 0;
    padding: 0.8mm 1mm;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    break-after: page;
    page-break-after: always;
    background: #fff;
  }
  .sticker:last-child { break-after: auto; page-break-after: auto; }
  .stack, .side { padding: 0; align-items: stretch; }
  .stack { flex-direction: column; }
  .side { flex-direction: row; }
  .face {
    box-sizing: border-box;
    display: flex;
    width: 100%;
    height: 100%;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    font-family: "Segoe UI", "Noto Sans Arabic", Tahoma, "Microsoft YaHei", "Noto Sans SC", sans-serif;
  }
  .stack .face, .side .face { flex: 1 1 50%; height: auto; overflow: hidden; }
  .stack .face { width: 38mm; height: 12.5mm; max-height: 12.5mm; border-bottom: 0.2mm dashed #bbb; }
  .stack .face:last-child { border-bottom: 0; }
  .side .face { width: 19mm; height: 25mm; max-width: 19mm; border-left: 0.2mm dashed #bbb; }
  .side .face:first-child { border-left: 0; }
  .name {
    margin: 0;
    max-height: 5.2mm;
    overflow: hidden;
    font-size: 7px;
    font-weight: 700;
    line-height: 1.1;
  }
  .name-zh {
    margin: 0.2mm 0 0;
    max-height: 3mm;
    overflow: hidden;
    font-size: 6px;
    font-weight: 600;
    line-height: 1.05;
    direction: ltr;
  }
  .price { margin: 0.35mm 0 0; }
  .price span {
    display: inline-block;
    padding: 0.3mm 1.2mm;
    border: 2px solid #000;
    background: #000;
    color: #fff;
    font-size: 9px;
    font-weight: 900;
    line-height: 1.1;
    direction: ltr;
  }
  .barcode { margin-top: 0.3mm; padding: 0 2.5mm; line-height: 0; direction: ltr; }
  .barcode svg { max-width: 100%; height: auto; shape-rendering: crispEdges; }
  .stack .name, .side .name { font-size: 5.5px; max-height: 3.6mm; }
  .stack .name-zh, .side .name-zh { font-size: 5px; }
  .stack .price span, .side .price span { font-size: 7px; padding: 0.15mm 0.6mm; border-width: 1.5px; }
</style>
</head>
<body>${pages}</body>
</html>`;
}

/** Print only the sticker document. The purchase invoice stays out of the preview. */
export function printIsolatedLabels(
  labels: IsolatedLabel[],
  template: LabelTemplate,
): void {
  const printable = labels.filter((label) => label.barcode.trim());
  if (printable.length === 0) return;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;left:-10000px;top:0;width:38mm;height:25mm;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  const frameDocument = iframe.contentDocument;
  if (!frameWindow || !frameDocument) {
    iframe.remove();
    return;
  }

  frameDocument.open();
  frameDocument.write(documentHtml(printable, template));
  frameDocument.close();

  const cleanup = () => {
    frameWindow.removeEventListener("afterprint", cleanup);
    iframe.remove();
  };
  frameWindow.addEventListener("afterprint", cleanup);
  window.setTimeout(() => {
    frameWindow.focus();
    frameWindow.print();
    window.setTimeout(cleanup, 60_000);
  }, 50);
}
