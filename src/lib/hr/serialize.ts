import type { Employee, EmployeeTransaction } from "@prisma/client";
import { calculateNetSalary, hrTypeLabel } from "@/lib/hr/calculations";

export function serializeEmployee(
  employee: Pick<
    Employee,
    "id" | "name" | "isActive" | "baseSalary" | "hireDate" | "createdAt"
  > & {
    transactions?: Pick<
      EmployeeTransaction,
      "type" | "amount" | "expenseId"
    >[];
  },
) {
  const transactions = employee.transactions ?? [];
  return {
    id: employee.id,
    name: employee.name,
    isActive: employee.isActive,
    baseSalary: employee.baseSalary,
    hireDate: employee.hireDate.toISOString(),
    createdAt: employee.createdAt.toISOString(),
    netSalary: calculateNetSalary(employee.baseSalary, transactions),
  };
}

export function serializeTransaction(tx: EmployeeTransaction) {
  return {
    id: tx.id,
    employeeId: tx.employeeId,
    date: tx.date.toISOString(),
    amount: tx.amount,
    type: tx.type,
    typeLabel: hrTypeLabel(tx.type),
    daysDeducted: tx.daysDeducted,
    note: tx.note,
    expenseId: tx.expenseId,
    createdAt: tx.createdAt.toISOString(),
    /** True when cash left the safe (linked Expense). */
    paidFromSafe: tx.expenseId != null,
  };
}
