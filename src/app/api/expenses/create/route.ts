import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { roundMoney } from "@/lib/treasury/ensureTreasury";
import {
  debitPaymentSource,
  parsePaymentSource,
} from "@/lib/treasury/debitPaymentSource";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

/**
 * POST /api/expenses/create
 * Save expense and debit Treasury cash OR a selected bank account.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    categoryId?: number;
    amount?: number;
    date?: string | null;
    notes?: string | null;
    sourceType?: string;
    bankAccountId?: number | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const categoryId = Number(body.categoryId);
  const amount = roundMoney(Number(body.amount));
  const notes =
    body.notes != null && String(body.notes).trim()
      ? String(body.notes).trim()
      : null;
  const expenseDate = body.date ? new Date(body.date) : new Date();

  if (!Number.isFinite(categoryId) || categoryId <= 0) {
    return NextResponse.json({ error: "Select a category" }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "Amount must be greater than 0" },
      { status: 400 },
    );
  }
  if (Number.isNaN(expenseDate.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  let source: ReturnType<typeof parsePaymentSource>;
  try {
    source = parsePaymentSource(body);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid payment source" },
      { status: 400 },
    );
  }

  const category = await prisma.expenseCategory.findUnique({
    where: { id: categoryId },
  });
  if (!category) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          categoryId,
          amount,
          date: expenseDate,
          notes,
          bankAccountId: source.bankAccountId,
        },
        include: { category: true, bankAccount: true },
      });

      const sourceLabel =
        source.sourceType === "BANK"
          ? `via bank`
          : "via Cash Safe";

      const debit = await debitPaymentSource(tx, {
        sourceType: source.sourceType,
        bankAccountId: source.bankAccountId,
        amount,
        reference: "EXPENSE",
        description: `Expense: ${category.name}${notes ? ` — ${notes}` : ""} (${sourceLabel})`,
        date: expenseDate,
      });

      return { expense, debit };
    });

    return NextResponse.json({
      ok: true,
      expense: {
        id: result.expense.id,
        categoryId: result.expense.categoryId,
        categoryName: result.expense.category.name,
        amount: result.expense.amount,
        date: result.expense.date.toISOString(),
        notes: result.expense.notes,
        bankAccountId: result.expense.bankAccountId,
        bankAccountName: result.expense.bankAccount?.name ?? null,
      },
      source: result.debit,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not create expense";
    const status = message.startsWith("Insufficient") ? 400 : 500;
    if (status === 500) console.error("[api/expenses/create]", error);
    return NextResponse.json({ error: message }, { status });
  }
}
