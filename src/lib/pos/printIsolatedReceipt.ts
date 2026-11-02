import type { LocalSale } from "@/types/woocommerce";
import { formatEGP, formatQty } from "@/lib/pos/money";
import { buildCode128Svg, receiptBarcodeValue } from "@/lib/pos/code128";
import {
  isCashPayment,
  isStaffMealPayment,
  paymentMethodLabelArZh,
} from "@/lib/pos/paymentMethods";

const STORE_NAME_AR = "ايجي شاينا سوبر ماركت";
const STORE_NAME_ZH = "埃及中国超市";
const STORE_PHONE = "01009972972";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function receiptCss(): string {
  return `
  @page { size: 80mm auto; margin: 0; }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body {
    width: 72mm;
    max-width: 72mm;
    margin: 0 auto;
    padding: 2mm 3mm 8mm;
    font-family: "Noto Sans Arabic", "Noto Sans SC", "Microsoft YaHei", "Segoe UI", Tahoma, Arial, sans-serif;
    font-size: 11px;
    line-height: 1.35;
  }
  .receipt-header {
    text-align: center;
    margin-bottom: 3mm;
    border-bottom: 1px dashed #000;
    padding-bottom: 2mm;
  }
  .receipt-logo {
    display: block;
    height: 16mm;
    width: auto;
    max-width: 68mm;
    margin: 0 auto 1.5mm;
    object-fit: contain;
    filter: grayscale(1) contrast(2);
  }
  .receipt-store-name { font-size: 13px; font-weight: 700; margin: 0 0 0.5mm; line-height: 1.4; }
  .receipt-store-name-zh { font-size: 12px; font-weight: 700; margin: 0 0 1.5mm; line-height: 1.35; }
  .receipt-phone { margin: 0; font-size: 11px; font-weight: 600; }
  .receipt-meta { margin: 2mm 0; border-bottom: 1px dashed #000; padding-bottom: 2mm; }
  .receipt-meta-row { display: flex; justify-content: space-between; gap: 2mm; margin-bottom: 0.8mm; font-size: 10px; }
  .receipt-order-id { font-weight: 700; font-family: ui-monospace, monospace; }
  .receipt-items-list { margin: 2mm 0; border-bottom: 1px dashed #000; padding-bottom: 1mm; }
  .receipt-item-block { padding: 1.2mm 0; border-bottom: 1px dotted #999; }
  .receipt-item-block:last-child { border-bottom: none; }
  .receipt-item-ar { margin: 0; font-size: 10px; font-weight: 700; line-height: 1.3; text-align: right; }
  .receipt-item-zh { margin: 0.4mm 0 0; font-size: 9px; font-weight: 600; line-height: 1.3; text-align: left; }
  .receipt-item-math { margin: 0.6mm 0 0; font-size: 10px; font-weight: 700; text-align: left; }
  .receipt-scale-tag { font-size: 8px; opacity: 0.75; }
  .receipt-totals { border-top: 1px dashed #000; margin-top: 2mm; padding-top: 2mm; }
  .receipt-total-row { display: flex; justify-content: space-between; margin-bottom: 1mm; font-size: 11px; }
  .receipt-total-final {
    font-size: 14px; font-weight: 800;
    border-top: 1px solid #000; border-bottom: 1px solid #000;
    padding: 1.5mm 0; margin: 1.5mm 0;
  }
  .receipt-barcode { display: flex; justify-content: center; margin: 4mm 0 2mm; direction: ltr; }
  .receipt-barcode svg { max-width: 100%; height: auto; }
  .receipt-footer { text-align: center; font-weight: 700; font-size: 11px; margin: 2mm 0 0; }
  .receipt-footer-zh { text-align: center; font-size: 10px; margin: 0.5mm 0 0; }
  `;
}

function buildReceiptBodyHtml(sale: LocalSale, logoUrl: string): string {
  const orderLabel = receiptBarcodeValue(sale);
  const barcodeSvg = buildCode128Svg(orderLabel, { height: 52, moduleWidth: 1.8 });
  const printedAt = new Date(sale.createdAt);
  const dateStr = printedAt.toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const timeStr = printedAt.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const paymentLabel = escapeHtml(paymentMethodLabelArZh(sale.paymentMethod));

  const items = sale.lines
    .map((line) => {
      const nameZh = line.nameZh?.trim() || "";
      const sku = line.sku?.trim() || "";
      const zhOrSku = [nameZh, sku].filter(Boolean).join(" / ");
      return `<div class="receipt-item-block">
        <p class="receipt-item-ar">${escapeHtml(line.name)}${
          line.isWeighted ? '<span class="receipt-scale-tag"> ميزان</span>' : ""
        }</p>
        ${
          zhOrSku
            ? `<p class="receipt-item-zh" lang="zh-CN" dir="ltr">${escapeHtml(zhOrSku)}</p>`
            : ""
        }
        <p class="receipt-item-math" dir="ltr">${escapeHtml(formatQty(line.qty))} × ${escapeHtml(formatEGP(line.unitPrice))} = ${escapeHtml(formatEGP(line.lineTotal))}</p>
      </div>`;
    })
    .join("");

  const subtotalGoods = isStaffMealPayment(sale.paymentMethod)
    ? sale.lines.reduce((sum, line) => sum + Math.abs(line.lineTotal), 0)
    : sale.loyalty && sale.loyalty.discountAmount > 0
      ? sale.lines.reduce((sum, line) => sum + line.lineTotal, 0)
      : Math.abs(sale.total);

  const cashBlock =
    isCashPayment(sale.paymentMethod) && !sale.isReturn
      ? `<div class="receipt-total-row"><span>النقدية / 现金</span><span>${escapeHtml(formatEGP(sale.tendered))}</span></div>
         <div class="receipt-total-row"><span>الباقي / 找零</span><span>${escapeHtml(formatEGP(sale.change))}</span></div>`
      : isCashPayment(sale.paymentMethod) && sale.isReturn
        ? `<div class="receipt-total-row"><span>نقد مرتجع / 退现</span><span>${escapeHtml(formatEGP(Math.abs(sale.total)))}</span></div>`
        : "";

  const loyaltyBlock = sale.loyalty
    ? `<div class="receipt-totals">
        <div class="receipt-total-row receipt-total-final"><span>برنامج الولاء / 积分</span><span></span></div>
        <div class="receipt-total-row"><span>رقم العميل / 会员</span><span>${escapeHtml(sale.loyalty.phone)}</span></div>
        <div class="receipt-total-row"><span>النقاط المكتسبة / 获得积分</span><span>${sale.loyalty.pointsEarned}</span></div>
        ${
          sale.loyalty.pointsRedeemed > 0
            ? `<div class="receipt-total-row"><span>تم استبدال / 兑换</span><span>${sale.loyalty.pointsRedeemed} (${escapeHtml(String(sale.loyalty.discountAmount))} ج.م)</span></div>`
            : ""
        }
        <div class="receipt-total-row"><span>رصيد النقاط / 余额</span><span>${sale.loyalty.pointsBalance}</span></div>
      </div>`
    : "";

  return `<div class="thermal-receipt" dir="rtl" lang="ar">
    <header class="receipt-header">
      <img class="receipt-logo" src="${escapeHtml(logoUrl)}" alt="logo" />
      <h1 class="receipt-store-name">${STORE_NAME_AR}</h1>
      <h2 class="receipt-store-name-zh" lang="zh-CN" dir="ltr">${STORE_NAME_ZH}</h2>
      <p class="receipt-phone">تليفون / 电话: ${STORE_PHONE}</p>
    </header>
    <div class="receipt-meta">
      <div class="receipt-meta-row"><span>التاريخ / 日期</span><span>${escapeHtml(dateStr)} ${escapeHtml(timeStr)}</span></div>
      <div class="receipt-meta-row"><span>رقم الطلب / 单号</span><span class="receipt-order-id">${escapeHtml(orderLabel)}</span></div>
      <div class="receipt-meta-row"><span>العميل / 顾客</span><span>${escapeHtml(sale.customerName)}</span></div>
      ${
        sale.cashierName
          ? `<div class="receipt-meta-row"><span>الكاشير / 收银员</span><span>${escapeHtml(sale.cashierName)}</span></div>`
          : ""
      }
      ${
        sale.isReturn
          ? `<div class="receipt-meta-row"><span>النوع / 类型</span><span>استرجاع / 退货</span></div>`
          : ""
      }
    </div>
    <div class="receipt-items-list">${items}</div>
    <div class="receipt-totals">
      <div class="receipt-total-row">
        <span>${sale.isReturn ? "المبلغ المرتجع / 退款小计" : "المجموع / 小计"}</span>
        <span>${escapeHtml(formatEGP(subtotalGoods))}</span>
      </div>
      <div class="receipt-total-row receipt-total-final">
        <span>${
          sale.isReturn
            ? "الإجمالي المرتجع / 退款总计"
            : isStaffMealPayment(sale.paymentMethod)
              ? "المحصّل / 实收"
              : "الإجمالي / 总计"
        }</span>
        <span>${escapeHtml(formatEGP(sale.isReturn ? -Math.abs(sale.total) : sale.total))}</span>
      </div>
      <div class="receipt-total-row"><span>الدفع / 支付</span><span>${paymentLabel}</span></div>
      ${cashBlock}
    </div>
    ${loyaltyBlock}
    <div class="receipt-barcode">${barcodeSvg}</div>
    <p class="receipt-footer">شكراً لزيارتكم</p>
    <p class="receipt-footer-zh" lang="zh-CN" dir="ltr">谢谢惠顾，欢迎再次光临</p>
  </div>`;
}

function waitForImages(doc: Document, timeoutMs: number): Promise<void> {
  const images = Array.from(doc.images);
  if (images.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(finish, timeoutMs);
    let remaining = images.length;
    const done = () => {
      remaining -= 1;
      if (remaining <= 0) finish();
    };
    for (const img of images) {
      if (img.complete) {
        done();
        continue;
      }
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
    }
  });
}

/**
 * Print an 80mm receipt in a hidden iframe so the POS UI never blocks on window.print().
 */
export function printIsolatedReceipt(
  sale: LocalSale,
  onAfterPrint?: () => void,
): void {
  const logoUrl = `${window.location.origin}/logos/logo-ar.svg`;
  const html = `<!DOCTYPE html><html lang="ar"><head><meta charset="utf-8" /><title>Receipt</title><style>${receiptCss()}</style></head><body>${buildReceiptBodyHtml(sale, logoUrl)}</body></html>`;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;left:-10000px;top:0;width:80mm;height:120mm;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  const frameDocument = iframe.contentDocument;
  if (!frameWindow || !frameDocument) {
    iframe.remove();
    onAfterPrint?.();
    return;
  }

  frameDocument.open();
  frameDocument.write(html);
  frameDocument.close();

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    frameWindow.removeEventListener("afterprint", cleanup);
    iframe.remove();
    onAfterPrint?.();
  };

  frameWindow.addEventListener("afterprint", cleanup);

  // Never block the POS thread: print after a short image budget, then drop the iframe.
  void waitForImages(frameDocument, 300).then(() => {
    window.setTimeout(() => {
      try {
        frameWindow.focus();
        frameWindow.print();
      } catch {
        cleanup();
        return;
      }
      window.setTimeout(() => {
        try {
          cleanup();
        } catch {
          // ignore
        }
      }, 3_000);
    }, 30);
  });
}
