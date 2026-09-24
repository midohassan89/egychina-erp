import type { Prisma } from "@prisma/client";
import { resolveLastPurchaseUnitCost } from "@/lib/inventory/resolveUnitCost";
import { ensureTreasury, roundMoney } from "@/lib/treasury/ensureTreasury";

type Tx = Prisma.TransactionClient;

const CATEGORY_NAME = "Staff Meals";

export interface StaffMealCostLine {
  wcProductId?: number | null;
  quantity: number;
}

/** Buying cost of the units actually removed from stock. Never uses the selling price. */
export async function staffMealBuyingCost(
  tx: Tx,
  lines: StaffMealCostLine[],
): Promise<number> {
  let total = 0;

  for (const line of lines) {
    const qty = Math.floor(Math.abs(Number(line.quantity) || 0));
    const wcId = Number(line.wcProductId);
    if (qty <= 0 || !Number.isFinite(wcId) || wcId <= 0) continue;

    const product = await tx.product.findFirst({
      where: { wcId, isDeleted: false },
      select: { id: true, linkedProductId: true, bundleMultiplier: true },
    });
    if (!product) continue;

    const multiplier = Math.floor(Number(product.bundleMultiplier) || 0);
    const isBundle = Boolean(product.linkedProductId) && multiplier > 0;
    const costProductId = isBundle ? product.linkedProductId! : product.id;
    const units = isBundle ? qty * multiplier : qty;
    const unitCost = await resolveLastPurchaseUnitCost(tx, costProductId);
    total += units * unitCost;
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

  const category = await tx.expenseCategory.upsert({
    where: { name: CATEGORY_NAME },
    create: { name: CATEGORY_NAME },
    update: {},
  });

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
