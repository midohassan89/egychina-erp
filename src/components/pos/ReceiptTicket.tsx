"use client";

import { useMemo } from "react";
import type { LocalSale } from "@/types/woocommerce";
import { formatEGP } from "@/lib/pos/money";
import { buildCode128Svg, receiptBarcodeValue } from "@/lib/pos/code128";
import {
  isCashPayment,
  isStaffMealPayment,
  paymentMethodLabel,
} from "@/lib/pos/paymentMethods";

const STORE_NAME = "سوق العبور العين السخنة - ايجي شاينا جروب";
const STORE_PHONE = "01009972972";

interface ReceiptTicketProps {
  sale: LocalSale | null;
}

/**
 * 80mm thermal receipt — hidden on screen, sole content when printing.
 */
export function ReceiptTicket({ sale }: ReceiptTicketProps) {
  const barcodeSvg = useMemo(() => {
    if (!sale) return "";
    return buildCode128Svg(receiptBarcodeValue(sale), {
      height: 40,
      moduleWidth: 1.1,
    });
  }, [sale]);

  if (!sale) return null;

  const orderLabel =
    sale.wooOrderId != null
      ? `#${sale.wooOrderId}`
      : sale.id.slice(0, 8).toUpperCase();

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

  const paymentLabel = paymentMethodLabel(sale.paymentMethod);

  return (
    <div id="thermal-receipt" className="thermal-receipt" dir="rtl">
      <header className="receipt-header">
        <h1 className="receipt-store-name">{STORE_NAME}</h1>
        <p className="receipt-phone">تليفون: {STORE_PHONE}</p>
        <p className="receipt-phone-en">Tel: {STORE_PHONE}</p>
      </header>

      <div className="receipt-meta">
        <div className="receipt-meta-row">
          <span>التاريخ / Date</span>
          <span>
            {dateStr} {timeStr}
          </span>
        </div>
        <div className="receipt-meta-row">
          <span>رقم الطلب / Order</span>
          <span className="receipt-order-id">{orderLabel}</span>
        </div>
        <div className="receipt-meta-row">
          <span>العميل / Customer</span>
          <span>{sale.customerName}</span>
        </div>
        {isStaffMealPayment(sale.paymentMethod) && sale.employeeName ? (
          <div className="receipt-meta-row">
            <span>الموظف / Employee</span>
            <span>{sale.employeeName}</span>
          </div>
        ) : null}
        {sale.isReturn ? (
          <>
            <div className="receipt-meta-row">
              <span>النوع / Type</span>
              <span>استرجاع / RETURN</span>
            </div>
            {sale.managerName ? (
              <div className="receipt-meta-row">
                <span>مدير / Manager</span>
                <span>{sale.managerName}</span>
              </div>
            ) : null}
            {sale.cashierName ? (
              <div className="receipt-meta-row">
                <span>كاشير / Cashier</span>
                <span>{sale.cashierName}</span>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <table className="receipt-items">
        <thead>
          <tr>
            <th className="col-name">الصنف</th>
            <th className="col-qty">الكمية</th>
            <th className="col-price">السعر</th>
            <th className="col-total">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {sale.lines.map((line, index) => (
            <tr key={`${line.productId}-${index}`}>
              <td className="col-name">
                {line.name}
                {line.isWeighted ? (
                  <span className="receipt-scale-tag"> ميزان</span>
                ) : null}
              </td>
              <td className="col-qty">
                {line.isWeighted
                  ? "1"
                  : Number.isInteger(line.qty)
                    ? String(line.qty)
                    : line.qty.toFixed(3)}
              </td>
              <td className="col-price">{formatEGP(line.unitPrice)}</td>
              <td className="col-total">{formatEGP(line.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="receipt-totals">
        <div className="receipt-total-row">
          <span>
            {sale.isReturn
              ? "المبلغ المرتجع / Refund"
              : "المجموع / Subtotal"}
          </span>
          <span>
            {formatEGP(
              isStaffMealPayment(sale.paymentMethod)
                ? sale.lines.reduce((sum, line) => sum + Math.abs(line.lineTotal), 0)
                : Math.abs(sale.total),
            )}
          </span>
        </div>
        <div className="receipt-total-row receipt-total-final">
          <span>
            {sale.isReturn
              ? "الإجمالي المرتجع / Total refund"
              : isStaffMealPayment(sale.paymentMethod)
                ? "المحصّل / Collected"
                : "الإجمالي / Total"}
          </span>
          <span>{formatEGP(sale.isReturn ? -Math.abs(sale.total) : sale.total)}</span>
        </div>
        <div className="receipt-total-row">
          <span>الدفع / Payment</span>
          <span>{paymentLabel}</span>
        </div>
        {isStaffMealPayment(sale.paymentMethod) && (
          <div className="receipt-total-row">
            <span>نقدي / Cash collected</span>
            <span>{formatEGP(0)}</span>
          </div>
        )}
        {isCashPayment(sale.paymentMethod) && !sale.isReturn && (
          <>
            <div className="receipt-total-row">
              <span>المدفوع / Paid</span>
              <span>{formatEGP(sale.tendered)}</span>
            </div>
            <div className="receipt-total-row">
              <span>الباقي / Change</span>
              <span>{formatEGP(sale.change)}</span>
            </div>
          </>
        )}
        {isCashPayment(sale.paymentMethod) && sale.isReturn && (
          <div className="receipt-total-row">
            <span>نقد مرتجع / Cash out</span>
            <span>{formatEGP(Math.abs(sale.total))}</span>
          </div>
        )}
      </div>

      <div
        className="receipt-barcode"
        dangerouslySetInnerHTML={{ __html: barcodeSvg }}
      />

      <p className="receipt-footer">شكراً لزيارتكم — Thank you</p>
      <p className="receipt-footer-sub">Souq El Obour · Ain Sokhna</p>
    </div>
  );
}
