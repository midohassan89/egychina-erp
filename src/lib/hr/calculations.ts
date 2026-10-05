/** Pure HR math — safe to import from client components. */

export function roundMoney(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export type NetSalaryTx = {
  type: string;
  amount: number;
  expenseId?: number | null;
};

/**
 * Current net salary owed:
 * baseSalary
 * + BONUS not yet paid out (no expense)
 * − ADVANCE − DEDUCTION − SALARY_PAYMENT
 */
export function calculateNetSalary(
  baseSalary: number,
  transactions: NetSalaryTx[],
): number {
  let net = Number(baseSalary) || 0;
  for (const tx of transactions) {
    const amount = Number(tx.amount) || 0;
    switch (tx.type) {
      case "BONUS":
        if (tx.expenseId == null) net += amount;
        break;
      case "ADVANCE":
      case "DEDUCTION":
      case "SALARY_PAYMENT":
        net -= amount;
        break;
      default:
        break;
    }
  }
  return roundMoney(net);
}

/** Daily rate used for absence / day deductions. */
export function deductionAmountFromDays(
  baseSalary: number,
  daysDeducted: number,
): number {
  const days = Number(daysDeducted);
  const salary = Number(baseSalary);
  if (!Number.isFinite(days) || days <= 0) return 0;
  if (!Number.isFinite(salary) || salary <= 0) return 0;
  return roundMoney((salary / 30) * days);
}

const TYPE_LABELS: Record<string, string> = {
  ADVANCE: "سلفة",
  DEDUCTION: "خصم",
  BONUS: "مكافأة",
  SALARY_PAYMENT: "صرف راتب",
};

export function hrTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}
