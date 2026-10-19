import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { roundMoney } from "@/lib/pos/money";
import { resolveReportPeriod, toDateKey } from "@/lib/reports/period";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

/**
 * GET /api/reports/summary?startDate=&endDate=
 * P&L: Revenue, COGS, Gross Profit, Expenses, Net Profit + daily revenue series.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const { start, end } = resolveReportPeriod(
    searchParams.get("startDate"),
    searchParams.get("endDate"),
  );

  const dateFilter = { gte: start, lte: end };

  const [sales, expenses, adjustments, onlineOrders] = await Promise.all([
    prisma.sale.findMany({
      where: { status: "completed", createdAt: dateFilter },
      include: { lines: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.expense.findMany({
      where: { date: dateFilter },
      select: { amount: true },
    }),
    prisma.inventoryAdjustment.findMany({
      where: {
        date: dateFilter,
        type: { in: ["WASTAGE", "LOSS", "PRODUCTION_USE", "EXPIRED"] },
      },
      include: { items: true },
    }),
    prisma.order.findMany({
      where: { createdAt: dateFilter, status: { not: "CANCELLED" } },
      select: { totalAmount: true },
    }),
  ]);

  let totalRevenue = 0;
  let posRevenue = 0;
  let cogs = 0;
  let operationalCogs = 0;
  const dailyMap = new Map<string, number>();

  // Seed daily buckets for continuous chart
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);
  while (cursor <= endDay) {
    dailyMap.set(toDateKey(cursor), 0);
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const sale of sales) {
    // Staff meals collect no money. Their cost is an expense, not sale COGS.
    if (sale.paymentMethod === "STAFF_MEAL") continue;

    totalRevenue += sale.total;
    if (sale.paymentMethod !== "store") posRevenue += sale.total;
    const key = toDateKey(sale.createdAt);
    dailyMap.set(key, roundMoney((dailyMap.get(key) ?? 0) + sale.total));

    const sign = sale.isReturn ? -1 : 1;
    for (const line of sale.lines) {
      const raw = sign * line.quantity * line.unitCost;
      cogs += raw;
      const price = line.unitPrice > 0 ? line.unitPrice : line.unitCost;
      const capped =
        line.unitPrice > 0 && line.unitCost > line.unitPrice
          ? sign * line.quantity * price
          : raw;
      operationalCogs += capped;
    }
  }

  totalRevenue = roundMoney(totalRevenue);
  cogs = roundMoney(cogs);
  operationalCogs = roundMoney(operationalCogs);
  const grossProfit = roundMoney(totalRevenue - cogs);
  const operationalGrossProfit = roundMoney(totalRevenue - operationalCogs);

  const expenseTotal = roundMoney(
    expenses.reduce((sum, e) => sum + e.amount, 0),
  );

  // Wastage / loss / production use: financial loss = -sum(qtyChange * unitCost) when negative
  let wastageLoss = 0;
  for (const adj of adjustments) {
    const impact = adj.items.reduce(
      (sum, item) => sum + item.quantityChange * item.unitCost,
      0,
    );
    // Negative impact = inventory value leaving → expense
    if (impact < 0) {
      wastageLoss += Math.abs(impact);
    }
  }
  wastageLoss = roundMoney(wastageLoss);

  const onlineRevenue = roundMoney(
    onlineOrders.reduce((sum, order) => sum + order.totalAmount, 0),
  );
  posRevenue = roundMoney(posRevenue);
  const totalExpenses = roundMoney(expenseTotal + wastageLoss);
  const netProfit = roundMoney(grossProfit - totalExpenses);
  const operationalNetProfit = roundMoney(operationalGrossProfit - totalExpenses);
  const anomalousCogs = roundMoney(cogs - operationalCogs);

  const dailyRevenue = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, revenue]) => ({ date, revenue: roundMoney(revenue) }));

  return NextResponse.json({
    period: {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    },
    kpis: {
      totalRevenue,
      posRevenue,
      onlineRevenue,
      cogs,
      grossProfit,
      operationalGrossProfit,
      totalExpenses,
      expenseTotal,
      wastageLoss,
      netProfit,
      operationalNetProfit,
      anomalousCogs,
    },
    dailyRevenue,
    meta: {
      saleCount: sales.length,
      expenseCount: expenses.length,
      adjustmentCount: adjustments.length,
    },
  });
}
