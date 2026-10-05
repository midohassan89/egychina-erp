import { NextResponse } from "next/server";
import type { EmployeeTransactionType } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth/roles";
import { roundMoney } from "@/lib/treasury/ensureTreasury";
import { deductionAmountFromDays } from "@/lib/hr/calculations";
import { createHrExpenseAndDebit, parsePaymentSource } from "@/lib/hr/payroll";
import { serializeEmployee, serializeTransaction } from "@/lib/hr/serialize";

const VALID_TYPES = new Set<EmployeeTransactionType>([
  "ADVANCE",
  "DEDUCTION",
  "BONUS",
  "SALARY_PAYMENT",
]);

/**
 * POST /api/employees/[id]/transactions
 * Create HR transaction. For ADVANCE / SALARY_PAYMENT / immediate BONUS,
 * also creates Expense + debits the selected safe/bank.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = await context.params;
  const employeeId = Number(params.id);
  if (!Number.isFinite(employeeId) || employeeId <= 0) {
    return NextResponse.json({ error: "Invalid employee" }, { status: 400 });
  }

  let body: {
    type?: string;
    amount?: number;
    daysDeducted?: number | null;
    note?: string | null;
    date?: string | null;
    /** BONUS only: true = pay now (Expense), false = add to salary balance */
    immediatePayment?: boolean;
    sourceType?: string;
    bankAccountId?: number | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const type = String(body.type ?? "").trim().toUpperCase() as EmployeeTransactionType;
  if (!VALID_TYPES.has(type)) {
    return NextResponse.json(
      { error: "type must be ADVANCE, DEDUCTION, BONUS, or SALARY_PAYMENT" },
      { status: 400 },
    );
  }

  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const note =
    body.note != null && String(body.note).trim()
      ? String(body.note).trim().slice(0, 500)
      : null;

  let date = new Date();
  if (body.date) {
    const parsed = new Date(body.date);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }
    date = parsed;
  }

  let daysDeducted: number | null = null;
  let amount = roundMoney(Number(body.amount));

  if (type === "DEDUCTION") {
    const days = Number(body.daysDeducted);
    if (Number.isFinite(days) && days > 0) {
      daysDeducted = days;
      amount = deductionAmountFromDays(employee.baseSalary, days);
    }
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "amount must be greater than 0" },
      { status: 400 },
    );
  }

  const immediateBonus = type === "BONUS" && body.immediatePayment === true;
  const needsSafe =
    type === "ADVANCE" || type === "SALARY_PAYMENT" || immediateBonus;

  let source: ReturnType<typeof parsePaymentSource> | null = null;
  if (needsSafe) {
    try {
      source = parsePaymentSource(body);
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "Select a safe / vault to pay from",
        },
        { status: 400 },
      );
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      let expenseId: number | null = null;

      if (needsSafe && source) {
        expenseId = await createHrExpenseAndDebit(tx, {
          employeeName: employee.name,
          type,
          amount,
          date,
          note,
          sourceType: source.sourceType,
          bankAccountId: source.bankAccountId,
        });
      }

      const transaction = await tx.employeeTransaction.create({
        data: {
          employeeId,
          date,
          amount,
          type,
          daysDeducted,
          note,
          expenseId,
        },
      });

      const updated = await tx.employee.findUniqueOrThrow({
        where: { id: employeeId },
        include: {
          transactions: {
            select: { type: true, amount: true, expenseId: true },
          },
        },
      });

      return { transaction, employee: updated };
    });

    return NextResponse.json(
      {
        ok: true,
        message: "Transaction recorded",
        transaction: serializeTransaction(result.transaction),
        employee: serializeEmployee(result.employee),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[api/employees/[id]/transactions]", error);
    const message =
      error instanceof Error ? error.message : "Could not record transaction";
    const status =
      message.toLowerCase().includes("insufficient") ||
      message.toLowerCase().includes("select")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
