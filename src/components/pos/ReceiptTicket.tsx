"use client";

import { useMemo } from "react";
import type { LocalSale } from "@/types/woocommerce";
import { formatEGP } from "@/lib/pos/money";
import { buildCode128Svg, receiptBarcodeValue } from "@/lib/pos/code128";
import {
  isCashPayment,
  isStaffMealPayment,
  paymentMethodLabelArZh,
} from "@/lib/pos/paymentMethods";

const STORE_NAME_AR = "ايجي شاينا سوبر ماركت";
const STORE_NAME_ZH = "埃及中国超市";
const STORE_PHONE = "01009972972";

function maskLoyaltyPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return phone;
  return `${digits.slice(0, 3)}****${digits.slice(-3)}`;
}

function qtyLabel(line: LocalSale["lines"][number]): string {
  if (line.isWeighted) return "1";
  return Number.isInteger(line.qty) ? String(line.qty) : line.qty.toFixed(3);
}

interface ReceiptTicketProps {
  sale: LocalSale | null;
}

/**
 * 80mm thermal receipt — bilingual Arabic + Chinese.
 * Hidden on screen; sole content when printing.
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

  const paymentLabel = paymentMethodLabelArZh(sale.paymentMethod);

  return (
    <div
      id="thermal-receipt"
      className="thermal-receipt"
      dir="rtl"
      lang="ar"
    >
      <header className="receipt-header">
        <h1 className="receipt-store-name">{STORE_NAME_AR}</h1>
        <h2 className="receipt-store-name-zh" lang="zh-CN" dir="ltr">
          {STORE_NAME_ZH}
        </h2>
        <p className="receipt-phone">تليفون / 电话: {STORE_PHONE}</p>
      </header>

      <div className="receipt-meta">
        <div className="receipt-meta-row">
          <span>التاريخ / 日期</span>
          <span>
            {dateStr} {timeStr}
          </span>
        </div>
        <div className="receipt-meta-row">
          <span>رقم الطلب / 单号</span>
          <span className="receipt-order-id">{orderLabel}</span>
        </div>
        <div className="receipt-meta-row">
          <span>العميل / 顾客</span>
          <span>{sale.customerName}</span>
        </div>
        {sale.cashierName ? (
          <div className="receipt-meta-row">
            <span>الكاشير / 收银员</span>
            <span>{sale.cashierName}</span>
          </div>
        ) : null}
        {isStaffMealPayment(sale.paymentMethod) && sale.employeeName ? (
          <div className="receipt-meta-row">
            <span>الموظف / 员工</span>
            <span>{sale.employeeName}</span>
          </div>
        ) : null}
        {sale.isReturn ? (
          <>
            <div className="receipt-meta-row">
              <span>النوع / 类型</span>
              <span>استرجاع / 退货</span>
            </div>
            {sale.managerName ? (
              <div className="receipt-meta-row">
                <span>مدير / 经理</span>
                <span>{sale.managerName}</span>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="receipt-items-list">
        {sale.lines.map((line, index) => {
          const nameZh = line.nameZh?.trim() || "";
          const sku = line.sku?.trim() || "";
          const zhOrSku = [nameZh, sku].filter(Boolean).join(" / ");
          return (
            <div
              key={`${line.productId}-${index}`}
              className="receipt-item-block"
            >
              <p className="receipt-item-ar">
                {line.name}
                {line.isWeighted ? (
                  <span className="receipt-scale-tag"> ميزان</span>
                ) : null}
              </p>
              {zhOrSku ? (
                <p className="receipt-item-zh" lang="zh-CN" dir="ltr">
                  {zhOrSku}
                </p>
              ) : null}
              <p className="receipt-item-math" dir="ltr">
                {qtyLabel(line)} × {formatEGP(line.unitPrice)} ={" "}
                {formatEGP(line.lineTotal)}
              </p>
            </div>
          );
        })}
      </div>

      <div className="receipt-totals">
        <div className="receipt-total-row">
          <span>
            {sale.isReturn
              ? "المبلغ المرتجع / 退款小计"
              : "المجموع / 小计"}
          </span>
          <span>
            {formatEGP(
              isStaffMealPayment(sale.paymentMethod)
                ? sale.lines.reduce(
                    (sum, line) => sum + Math.abs(line.lineTotal),
                    0,
                  )
                : sale.loyalty && sale.loyalty.discountAmount > 0
                  ? sale.lines.reduce((sum, line) => sum + line.lineTotal, 0)
                  : Math.abs(sale.total),
            )}
          </span>
        </div>
        <div className="receipt-total-row receipt-total-final">
          <span>
            {sale.isReturn
              ? "الإجمالي المرتجع / 退款总计"
              : isStaffMealPayment(sale.paymentMethod)
                ? "المحصّل / 实收"
                : "الإجمالي / 总计"}
          </span>
          <span>
            {formatEGP(sale.isReturn ? -Math.abs(sale.total) : sale.total)}
          </span>
        </div>
        <div className="receipt-total-row">
          <span>الدفع / 支付</span>
          <span>{paymentLabel}</span>
        </div>
        {isStaffMealPayment(sale.paymentMethod) && (
          <div className="receipt-total-row">
            <span>النقدية / 现金</span>
            <span>{formatEGP(0)}</span>
          </div>
        )}
        {isCashPayment(sale.paymentMethod) && !sale.isReturn && (
          <>
            <div className="receipt-total-row">
              <span>النقدية / 现金</span>
              <span>{formatEGP(sale.tendered)}</span>
            </div>
            <div className="receipt-total-row">
              <span>الباقي / 找零</span>
              <span>{formatEGP(sale.change)}</span>
            </div>
          </>
        )}
        {isCashPayment(sale.paymentMethod) && sale.isReturn && (
          <div className="receipt-total-row">
            <span>نقد مرتجع / 退现</span>
            <span>{formatEGP(Math.abs(sale.total))}</span>
          </div>
        )}
      </div>

      {sale.loyalty ? (
        <div className="receipt-totals">
          <div className="receipt-total-row receipt-total-final">
            <span>برنامج الولاء / 积分</span>
            <span />
          </div>
          <div className="receipt-total-row">
            <span>رقم العميل / 会员: {maskLoyaltyPhone(sale.loyalty.phone)}</span>
          </div>
          <div className="receipt-total-row">
            <span>
              النقاط المكتسبة / 获得积分: {sale.loyalty.pointsEarned}
            </span>
          </div>
          {sale.loyalty.pointsRedeemed > 0 ? (
            <div className="receipt-total-row">
              <span>
                تم استبدال / 兑换: {sale.loyalty.pointsRedeemed} نقطة (خصم{" "}
                {sale.loyalty.discountAmount} ج.م)
              </span>
            </div>
          ) : null}
          <div className="receipt-total-row">
            <span>
              رصيد النقاط / 余额: {sale.loyalty.pointsBalance}
            </span>
          </div>
        </div>
      ) : null}

      <div
        className="receipt-barcode"
        dangerouslySetInnerHTML={{ __html: barcodeSvg }}
      />

      <p className="receipt-footer">شكراً لزيارتكم</p>
      <p className="receipt-footer-zh" lang="zh-CN" dir="ltr">
        谢谢惠顾，欢迎再次光临
      </p>
    </div>
  );
}
