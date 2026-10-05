import type { EmployeeTransactionType, Prisma } from "@prisma/client";
import {
  debitPaymentSource,
  parsePaymentSource,
  type PaymentSourceType,
} from "@/lib/treasury/debitPaymentSource";
import { hrTypeLabel, roundMoney } from "@/lib/hr/calculations";

export {
  calculateNetSalary,
  deductionAmountFromDays,
  hrTypeLabel,
  roundMoney,
} from "@/lib/hr/calculations";

type Tx = Prisma.TransactionClient;

const HR_CATEGORY_NAMES = ["رواتب وموظفين", "رواتب"] as const;

export type HrTxType = EmployeeTransactionType;

export async function ensureHrExpenseCategory(tx: Tx) {
  const matches = await tx.expenseCategory.findMany({
    where: { name: { in: [...HR_CATEGORY_NAMES] } },
  });
  return (
    matches.find((row) => row.name === "رواتب وموظفين") ??
    matches[0] ??
    (await tx.expenseCategory.create({ data: { name: "رواتب وموظفين" } }))
  );
}

/**
 * Create Expense + debit treasury/bank inside an existing Prisma transaction.
 * Returns the new expense id.
 */
export async function createHrExpenseAndDebit(
  tx: Tx,
  opts: {
    employeeName: string;
    type: HrTxType;
    amount: number;
    date: Date;
    note: string | null;
    sourceType: PaymentSourceType;
    bankAccountId: number | null;
  },
): Promise<number> {
  const amount = roundMoney(opts.amount);
  const category = await ensureHrExpenseCategory(tx);
  const label = hrTypeLabel(opts.type);
  const notes = [
    `HR · ${label} · ${opts.employeeName}`,
    opts.note?.trim() || null,
  ]
    .filter(Boolean)
    .join(" — ");

  const expense = await tx.expense.create({
    data: {
      categoryId: category.id,
      amount,
      date: opts.date,
      notes,
      bankAccountId: opts.bankAccountId,
    },
  });

  await debitPaymentSource(tx, {
    sourceType: opts.sourceType,
    bankAccountId: opts.bankAccountId,
    amount,
    reference: `EMP_${opts.type}`,
    description: notes,
    date: opts.date,
  });

  return expense.id;
}

export { parsePaymentSource };
