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

function barsSvg(barcode: string, moduleWidth: number): string {
  return buildCode128Svg(barcode, {
    height: 40,
    moduleWidth,
    displayValue: false,
    quietModules: 0,
  });
}

function singleHtml(label: IsolatedLabel): string {
  const name = escapeHtml(label.name);
  const zh = label.nameZh?.trim() ? escapeHtml(label.nameZh.trim()) : "";
  const price = escapeHtml(formatLabelPrice(label.price));
  const code = escapeHtml(label.barcode);
  return `<section class="sticker single">
    <p class="name-ar">${name}</p>
    ${zh ? `<p class="name-zh" lang="zh-CN">${zh}</p>` : ""}
    <p class="price"><span>${price}</span></p>
    <div class="bars">${barsSvg(label.barcode, 2)}</div>
    <p class="digits">${code}</p>
  </section>`;
}

function splitHalfHtml(label: IsolatedLabel): string {
  const title = escapeHtml(label.nameZh?.trim() || label.name);
  const price = escapeHtml(formatLabelPrice(label.price));
  const code = escapeHtml(label.barcode);
  const lang = label.nameZh?.trim() ? ` lang="zh-CN"` : "";
  return `<div class="half">
    <div class="row">
      <span class="half-name"${lang}>${title}</span>
      <span class="half-price">${price}</span>
    </div>
    <div class="bars">${barsSvg(label.barcode, 1.5)}</div>
    <p class="digits">${code}</p>
  </div>`;
}

function stickerHtml(label: IsolatedLabel, template: LabelTemplate): string {
  if (template.layout === "single") return singleHtml(label);
  const klass = template.layout === "stack" ? "sticker split" : "sticker split side";
  const half = splitHalfHtml(label);
  return `<section class="${klass}">${half}<div class="gap"></div>${half}</section>`;
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
  html, body { margin: 0; padding: 0; background: #fff; color: #000000; }
  body { width: 38mm; }
  .sticker {
    box-sizing: border-box;
    width: 38mm;
    height: 25mm;
    margin: 0;
    padding: 0;
    overflow: hidden;
    background: #fff;
    color: #000000;
    break-after: page;
    page-break-after: always;
    font-family: "Segoe UI", Tahoma, "Microsoft YaHei", "Noto Sans SC", sans-serif;
  }
  .sticker:last-child { break-after: auto; page-break-after: auto; }
  .single {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    padding: 0.6mm 1.2mm 0;
  }
  .name-ar {
    margin: 0;
    color: #000000;
    font-size: 8pt;
    font-weight: 800;
    line-height: 1.15;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .single .name-zh {
    margin: 0.5mm 0 0;
    color: #000000;
    font-size: 7.5pt;
    font-weight: 800;
    line-height: 1.15;
    text-align: center;
    direction: ltr;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .single .price { margin: 1mm auto; text-align: center; }
  .single .price span {
    display: inline-block;
    border: 1.8px solid #000000;
    border-radius: 2px;
    padding: 0.5mm 2.5mm;
    background: #fff;
    color: #000000;
    font-size: 10.5pt;
    font-weight: 900;
    line-height: 1.1;
    white-space: nowrap;
  }
  .single .bars { height: 7.5mm; padding: 0 2.5mm; }
  .single .digits {
    margin: 0.3mm 0 0;
    color: #000000;
    font-size: 7.5pt;
    font-weight: 800;
    letter-spacing: 0.5px;
    line-height: 1;
    text-align: center;
  }
  .split { display: flex; flex-direction: column; }
  .split.side { flex-direction: row; }
  .half {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    height: 11.5mm;
    max-height: 11.5mm;
    overflow: hidden;
    padding: 0.5mm 1.5mm 0 1.5mm;
  }
  .split.side .half {
    width: 18mm;
    height: 25mm;
    max-height: 25mm;
    padding: 0.6mm 0.8mm 0;
  }
  .gap { height: 2mm; width: 100%; }
  .split.side .gap { width: 2mm; height: 25mm; }
  .row {
    display: flex;
    flex: 0 0 3.8mm;
    justify-content: space-between;
    align-items: center;
    height: 3.8mm;
    gap: 0.6mm;
  }
  .half-name {
    max-width: 62%;
    color: #000000;
    font-size: 7.5pt;
    font-weight: 800;
    line-height: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    direction: ltr;
  }
  .half-price {
    border: 1.5px solid #000000;
    padding: 0 3px;
    background: #fff;
    color: #000000;
    font-size: 8pt;
    font-weight: 900;
    line-height: 1.1;
    white-space: nowrap;
  }
  .bars {
    box-sizing: border-box;
    flex: 1 1 5.2mm;
    width: 100%;
    height: 5.2mm;
    max-height: 5.2mm;
    min-height: 0;
    padding: 0 2mm;
    line-height: 0;
  }
  .bars svg { display: block; width: 100%; height: 100%; shape-rendering: crispEdges; }
  .half .digits {
    flex: 0 0 auto;
    margin: 0.2mm 0 0;
    color: #000000;
    font-size: 6.5pt;
    font-weight: 800;
    line-height: 1;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
  }
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
