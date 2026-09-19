import type { Shift } from "@prisma/client";
import type { CashierShift, ZReportSummary } from "@/types/woocommerce";
import { roundMoney } from "@/lib/pos/money";
import { sumShiftSales } from "@/lib/shifts/salesFields";
import { cashierShiftToZReport } from "@/lib/shifts/zReportFromShift";

export function mapShiftToCashierShift(shift: Shift): CashierShift {
  const cashSales = roundMoney(shift.cashSales);
  const visaSales = roundMoney(shift.visaSales);
  const walletSales = roundMoney(shift.walletSales);
  const instapaySales = roundMoney(shift.instapaySales);
  const wechatSales = roundMoney(shift.wechatSales);
  const startingCash = roundMoney(shift.startingCash);
  const totalSales = roundMoney(
    sumShiftSales({
      cashSales,
      visaSales,
      walletSales,
      instapaySales,
      wechatSales,
    }),
  );
  const cardSales = roundMoney(
    visaSales + walletSales + instapaySales + wechatSales,
  );

  return {
    id: String(shift.id),
    startedAt: shift.startTime.toISOString(),
    endedAt: shift.endTime?.toISOString() ?? null,
    startingCash,
    status: shift.status === "OPEN" ? "open" : "closed",
    cashSales,
    visaSales,
    walletSales,
    instapaySales,
    wechatSales,
    cardSales,
    totalSales,
    // STRICT: physical drawer expected cash = float + cash sales only.
    expectedCash: roundMoney(startingCash + cashSales),
    ticketCount: shift.tickets,
    actualCash: shift.actualCash != null ? roundMoney(shift.actualCash) : undefined,
    variance: shift.variance != null ? roundMoney(shift.variance) : undefined,
  };
}

export function buildShiftZReport(
  shift: Shift,
  endedAt: string = new Date().toISOString(),
): ZReportSummary {
  return cashierShiftToZReport(mapShiftToCashierShift(shift), endedAt);
}

export { cashierShiftToZReport } from "@/lib/shifts/zReportFromShift";
