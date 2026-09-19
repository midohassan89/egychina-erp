import type { CashierShift, ZReportSummary } from "@/types/woocommerce";
import { roundMoney } from "@/lib/pos/money";
import { sumShiftSales } from "@/lib/shifts/salesFields";

/** Build a Z-Report summary from a mapped CashierShift (server totals). */
export function cashierShiftToZReport(
  mapped: CashierShift,
  endedAt: string = new Date().toISOString(),
): ZReportSummary {
  const cashSales = roundMoney(mapped.cashSales ?? 0);
  const visaSales = roundMoney(mapped.visaSales ?? 0);
  const walletSales = roundMoney(mapped.walletSales ?? 0);
  const instapaySales = roundMoney(mapped.instapaySales ?? 0);
  const wechatSales = roundMoney(mapped.wechatSales ?? 0);
  const totalSales = roundMoney(
    mapped.totalSales ??
      sumShiftSales({
        cashSales,
        visaSales,
        walletSales,
        instapaySales,
        wechatSales,
      }),
  );
  const cardSales = roundMoney(
    mapped.cardSales ?? visaSales + walletSales + instapaySales + wechatSales,
  );
  // STRICT: physical drawer only — never include digital payments.
  const expectedCash = roundMoney(
    mapped.expectedCash ?? mapped.startingCash + cashSales,
  );

  return {
    shiftId: mapped.id,
    startedAt: mapped.startedAt,
    endedAt,
    startingCash: mapped.startingCash,
    cashSales,
    visaSales,
    walletSales,
    instapaySales,
    wechatSales,
    cardSales,
    totalSales,
    expectedCash,
    ticketCount: mapped.ticketCount ?? 0,
    cashTickets: 0,
    cardTickets: 0,
    cashRefunds: 0,
    returnTickets: 0,
    actualCash: mapped.actualCash,
    variance: mapped.variance,
  };
}
