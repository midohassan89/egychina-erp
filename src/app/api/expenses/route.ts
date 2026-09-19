import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

/** GET /api/expenses — list expenses + categories */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [expenses, categories] = await Promise.all([
    prisma.expense.findMany({
      orderBy: { date: "desc" },
      take: 100,
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
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
    })),
  });
}
