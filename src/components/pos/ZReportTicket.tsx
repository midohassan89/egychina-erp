"use client";

import type { ZReportSummary } from "@/types/woocommerce";
import { formatEGP } from "@/lib/pos/money";

const STORE_NAME = "سوق العبور العين السخنة - ايجي شاينا جروب";
const STORE_PHONE = "01009972972";

interface ZReportTicketProps {
  report: ZReportSummary | null;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Print-only Z-Report for 80mm thermal printers.
 * Expected cash = startingCash + cashSales only (physical drawer).
 */
export function ZReportTicket({ report }: ZReportTicketProps) {
  if (!report) return null;

  const digitalRows: { label: string; amount: number }[] = [
    { label: "مبيعات فيزا / Visa sales", amount: report.visaSales },
    { label: "مبيعات محفظة / Wallet sales", amount: report.walletSales },
    {
      label: "مبيعات انستا باي / InstaPay sales",
      amount: report.instapaySales,
    },
    { label: "مبيعات وي شات / WeChat sales", amount: report.wechatSales },
  ];

  return (
    <div id="thermal-z-report" className="thermal-receipt" dir="rtl">
      <header className="receipt-header">
        <h1 className="receipt-store-name">{STORE_NAME}</h1>
        <p className="receipt-phone">تليفون: {STORE_PHONE}</p>
        <p className="receipt-phone-en">Tel: {STORE_PHONE}</p>
        <p className="receipt-z-title">تقرير Z / Z-REPORT</p>
      </header>

      <div className="receipt-meta">
        <div className="receipt-meta-row">
          <span>بداية الوردية / Start</span>
          <span>{formatDateTime(report.startedAt)}</span>
        </div>
        <div className="receipt-meta-row">
          <span>نهاية الوردية / End</span>
          <span>{formatDateTime(report.endedAt)}</span>
        </div>
        <div className="receipt-meta-row">
          <span>رقم الوردية / Shift</span>
          <span className="receipt-order-id">
            {report.shiftId.slice(0, 8).toUpperCase()}
          </span>
        </div>
      </div>

      <div className="receipt-totals">
        <div className="receipt-total-row">
          <span>نقدية الافتتاح / Starting cash</span>
          <span>{formatEGP(report.startingCash)}</span>
        </div>
        <div className="receipt-total-row">
          <span>مبيعات نقدي / Cash sales</span>
          <span>{formatEGP(report.cashSales)}</span>
        </div>
        {digitalRows.map((row) => (
          <div key={row.label} className="receipt-total-row">
            <span>{row.label}</span>
            <span>{formatEGP(row.amount)}</span>
          </div>
        ))}
        {((report.cashRefunds ?? 0) > 0 || (report.returnTickets ?? 0) > 0) && (
          <div className="receipt-total-row">
            <span>مرتجعات نقدي / Cash refunds</span>
            <span>−{formatEGP(report.cashRefunds ?? 0)}</span>
          </div>
        )}
        <div className="receipt-total-row receipt-total-final">
          <span>إجمالي المبيعات / Total sales</span>
          <span>{formatEGP(report.totalSales)}</span>
        </div>
        <div className="receipt-total-row">
          <span>عدد الفواتير / Tickets</span>
          <span>{report.ticketCount}</span>
        </div>
        <div className="receipt-total-row receipt-total-final">
          <span>النقد المتوقع / Expected cash</span>
          <span>{formatEGP(report.expectedCash)}</span>
        </div>
        {report.actualCash != null && (
          <div className="receipt-total-row">
            <span>النقد الفعلي / Actual cash</span>
            <span>{formatEGP(report.actualCash)}</span>
          </div>
        )}
        {report.variance != null && (
          <div className="receipt-total-row">
            <span>الفرق / Discrepancy</span>
            <span>{formatEGP(report.variance)}</span>
          </div>
        )}
      </div>

      <p className="receipt-footer">إغلاق الصندوق — Register closed</p>
      <p className="receipt-footer-sub">Souq El Obour · Ain Sokhna</p>
    </div>
  );
}
