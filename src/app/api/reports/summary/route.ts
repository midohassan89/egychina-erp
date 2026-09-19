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

  const [sales, expenses, adjustments] = await Promise.all([
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
        type: { in: ["WASTAGE", "LOSS", "PRODUCTION_USE"] },
      },
      include: { items: true },
    }),
  ]);

  let totalRevenue = 0;
  let cogs = 0;
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
    totalRevenue += sale.total;
    const key = toDateKey(sale.createdAt);
    dailyMap.set(key, roundMoney((dailyMap.get(key) ?? 0) + sale.total));

    const sign = sale.isReturn ? -1 : 1;
    for (const line of sale.lines) {
      cogs += sign * line.quantity * line.unitCost;
    }
  }

  totalRevenue = roundMoney(totalRevenue);
  cogs = roundMoney(cogs);
  const grossProfit = roundMoney(totalRevenue - cogs);

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

  const totalExpenses = roundMoney(expenseTotal + wastageLoss);
  const netProfit = roundMoney(grossProfit - totalExpenses);

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
      cogs,
      grossProfit,
      totalExpenses,
      expenseTotal,
      wastageLoss,
      netProfit,
    },
    dailyRevenue,
    meta: {
      saleCount: sales.length,
      expenseCount: expenses.length,
      adjustmentCount: adjustments.length,
    },
  });
}
