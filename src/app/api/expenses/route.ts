import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { roundMoney } from "@/lib/pos/money";

function localDayStart(isoDate: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localDayEnd(isoDate: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    23,
    59,
    59,
    999,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

/**
 * GET /api/expenses?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&categoryId=
 * Filters use the expense date (the date shown in the table).
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
  const start = localDayStart(searchParams.get("startDate") ?? "");
  const end = localDayEnd(searchParams.get("endDate") ?? "");
  const categoryRaw = Number(searchParams.get("categoryId"));
  const categoryId =
    Number.isFinite(categoryRaw) && categoryRaw > 0 ? categoryRaw : null;

  const where: Prisma.ExpenseWhereInput = {};
  if (start || end) {
    where.date = {
      ...(start ? { gte: start } : {}),
      ...(end ? { lte: end } : {}),
    };
  }
  if (categoryId) {
    where.categoryId = categoryId;
  }

  const [expenses, categories] = await Promise.all([
    prisma.expense.findMany({
      where,
      orderBy: { date: "desc" },
      include: {
        category: { select: { id: true, name: true } },
        bankAccount: { select: { id: true, name: true } },
      },
    }),
    prisma.expenseCategory.findMany({ orderBy: { name: "asc" } }),
  ]);

  return NextResponse.json({
    expenses: expenses.map((e) => ({
      id: e.id,
      categoryId: e.categoryId,
      categoryName: e.category.name,
      amount: e.amount,
      date: e.date.toISOString(),
      notes: e.notes,
      bankAccountId: e.bankAccountId,
      bankAccountName: e.bankAccount?.name ?? null,
      paymentSource: e.bankAccount?.name ?? "Cash Safe",
    })),
    total: roundMoney(expenses.reduce((sum, expense) => sum + expense.amount, 0)),
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
    })),
  });
}
