import type { Prisma } from "@prisma/client";
import { resolveLastPurchaseUnitCost } from "@/lib/inventory/resolveUnitCost";
import { ensureTreasury, roundMoney } from "@/lib/treasury/ensureTreasury";

type Tx = Prisma.TransactionClient;

const CATEGORY_NAMES = ["وجبات عمال", "Staff Meals"] as const;

export interface StaffMealCostLine {
  wcProductId?: number | null;
  quantity: number;
  /** Selling price charged on this cart line. */
  unitPrice?: number | null;
}

/**
 * Staff-meal expense for one cart.
 * Each line uses the product's last purchase cost when it is above zero,
 * otherwise the selling price on that cart line.
 */
export async function staffMealExpenseAmount(
  tx: Tx,
  lines: StaffMealCostLine[],
): Promise<number> {
  let total = 0;

  for (const line of lines) {
    const qty = Math.abs(Number(line.quantity) || 0);
    if (qty <= 0) continue;

    const selling = Number(line.unitPrice);
    const sellingUnit = Number.isFinite(selling) && selling > 0 ? selling : 0;

    let buying = 0;
    const wcId = Number(line.wcProductId);
    if (Number.isFinite(wcId) && wcId > 0) {
      const product = await tx.product.findFirst({
        where: { wcId, isDeleted: false },
        select: { id: true },
      });
      if (product) {
        buying = await resolveLastPurchaseUnitCost(tx, product.id);
      }
    }

    const unit = buying > 0 ? buying : sellingUnit;
    total += unit * qty;
  }

  return roundMoney(total);
}

/**
 * Book the meal's buying cost as an outgoing Staff Meals expense and
 * deduct that cost from the treasury. No incoming cash is recorded.
 */
export async function recordStaffMealExpense(
  tx: Tx,
  input: {
    saleId: string;
    employeeName: string;
    amount: number;
    date: Date;
  },
) {
  const amount = roundMoney(input.amount);
  if (amount <= 0.001) return null;

  const matches = await tx.expenseCategory.findMany({
    where: { name: { in: [...CATEGORY_NAMES] } },
  });
  const category =
    matches.find((row) => row.name === "وجبات عمال") ??
    matches[0] ??
    (await tx.expenseCategory.create({ data: { name: "وجبات عمال" } }));

  const note = `وجبات عمال — ${input.employeeName} · Order #${input.saleId}`;

  const expense = await tx.expense.create({
    data: {
      categoryId: category.id,
      amount,
      date: input.date,
      notes: note,
      bankAccountId: null,
    },
  });

  await ensureTreasury(tx);
  await tx.treasuryTransaction.create({
    data: {
      type: "OUT",
      amount,
      description: `Staff Meals — ${input.employeeName} · Order #${input.saleId}`,
      reference: "STAFF_MEAL",
      date: input.date,
    },
  });
  await tx.treasury.update({
    where: { id: 1 },
    data: { balance: { decrement: amount } },
  });

  return expense;
}
