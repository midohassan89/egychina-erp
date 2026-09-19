import { roundMoney } from "@/lib/pos/money";
import { sumShiftSales } from "@/lib/shifts/salesFields";
import type {
  CashierShift,
  LocalSale,
  PaymentMethod,
  ZReportSummary,
} from "@/types/woocommerce";

function bucketFor(method: PaymentMethod): keyof Pick<
  ZReportSummary,
  "cashSales" | "visaSales" | "walletSales" | "instapaySales" | "wechatSales"
> {
  switch (method) {
    case "cash":
      return "cashSales";
    case "visa":
    case "card":
      return "visaSales";
    case "wallet":
      return "walletSales";
    case "instapay":
      return "instapaySales";
    case "wechat":
      return "wechatSales";
    default:
      return "cashSales";
  }
}

/**
 * Offline / IndexedDB fallback Z-Report builder.
 * Expected cash stays startingCash + cashSales only.
 */
export function buildZReport(
  shift: CashierShift,
  sales: LocalSale[],
  endedAt: string = new Date().toISOString(),
): ZReportSummary {
  let cashSales = 0;
  let visaSales = 0;
  let walletSales = 0;
  let instapaySales = 0;
  let wechatSales = 0;
  let cashTickets = 0;
  let cardTickets = 0;
  let cashRefunds = 0;
  let returnTickets = 0;

  const add = (
    field: ReturnType<typeof bucketFor>,
    amount: number,
  ) => {
    switch (field) {
      case "cashSales":
        cashSales += amount;
        break;
      case "visaSales":
        visaSales += amount;
        break;
      case "walletSales":
        walletSales += amount;
        break;
      case "instapaySales":
        instapaySales += amount;
        break;
      case "wechatSales":
        wechatSales += amount;
        break;
    }
  };

  for (const sale of sales) {
    const isReturn = Boolean(sale.isReturn) || sale.total < 0;
    const field = bucketFor(sale.paymentMethod);

    if (isReturn) {
      returnTickets += 1;
      if (sale.paymentMethod === "cash") {
        cashRefunds += Math.abs(sale.total);
        cashTickets += 1;
      } else {
        cardTickets += 1;
      }
      add(field, sale.total);
      continue;
    }

    if (sale.paymentMethod === "cash") {
      cashTickets += 1;
    } else {
      cardTickets += 1;
    }
    add(field, sale.total);
  }

  cashSales = roundMoney(cashSales);
  visaSales = roundMoney(visaSales);
  walletSales = roundMoney(walletSales);
  instapaySales = roundMoney(instapaySales);
  wechatSales = roundMoney(wechatSales);
  cashRefunds = roundMoney(cashRefunds);

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
  const expectedCash = roundMoney(shift.startingCash + cashSales);

  return {
    shiftId: shift.id,
    startedAt: shift.startedAt,
    endedAt,
    startingCash: shift.startingCash,
    cashSales,
    visaSales,
    walletSales,
    instapaySales,
    wechatSales,
    cardSales,
    totalSales,
    expectedCash,
    ticketCount: sales.length,
    cashTickets,
    cardTickets,
    cashRefunds,
    returnTickets,
  };
}
