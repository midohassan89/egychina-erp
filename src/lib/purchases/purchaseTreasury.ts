import type { Prisma } from "@prisma/client";
import { ensureTreasury, roundMoney } from "@/lib/treasury/ensureTreasury";

type Tx = Prisma.TransactionClient;

function purchaseReference(invoiceId: number) {
  return `PURCHASE:${invoiceId}`;
}

function paymentDescription(invoiceId: number) {
  return `Payment for Purchase Invoice #${invoiceId}`;
}

/**
 * Move the physical safe so it tracks this invoice's paid amount.
 * `previousPaid` is 0 on create. On edit, only the difference is applied.
 * Prefers updating the invoice's existing OUT row; otherwise writes an adjusting entry.
 */
export async function syncPurchaseTreasuryPayment(
  tx: Tx,
  input: {
    invoiceId: number;
    previousPaid: number;
    nextPaid: number;
    date: Date;
  },
) {
  const delta = roundMoney(input.nextPaid - input.previousPaid);
  if (Math.abs(delta) <= 0.001) return;

  const reference = purchaseReference(input.invoiceId);
  const description = paymentDescription(input.invoiceId);

  const existing = await tx.treasuryTransaction.findFirst({
    where: { reference, type: "OUT" },
    orderBy: { id: "asc" },
  });

  if (delta > 0) {
    const treasury = await ensureTreasury(tx);
    if (treasury.balance + 0.001 < delta) {
      throw new Error(
        `Insufficient treasury balance (have ${treasury.balance.toFixed(2)}, need ${delta.toFixed(2)})`,
      );
    }

    if (existing) {
      await tx.treasuryTransaction.update({
        where: { id: existing.id },
        data: {
          amount: roundMoney(existing.amount + delta),
          description,
          date: input.date,
        },
      });
    } else {
      await tx.treasuryTransaction.create({
        data: {
          type: "OUT",
          amount: delta,
          description,
          reference,
          date: input.date,
        },
      });
    }

    await tx.treasury.update({
      where: { id: 1 },
      data: { balance: { decrement: delta } },
    });
    return;
  }

  const credit = roundMoney(Math.abs(delta));
  await ensureTreasury(tx);

  if (!existing) {
    return;
  }

  if (existing.amount + 0.001 >= credit) {
    const nextAmount = roundMoney(existing.amount - credit);
    if (nextAmount <= 0.001) {
      await tx.treasuryTransaction.delete({ where: { id: existing.id } });
    } else {
      await tx.treasuryTransaction.update({
        where: { id: existing.id },
        data: { amount: nextAmount, description, date: input.date },
      });
    }
  } else {
    const remainder = roundMoney(credit - existing.amount);
    await tx.treasuryTransaction.delete({ where: { id: existing.id } });
    if (remainder > 0.001) {
      await tx.treasuryTransaction.create({
        data: {
          type: "IN",
          amount: remainder,
          description: `Payment adjustment for Purchase Invoice #${input.invoiceId}`,
          reference,
          date: input.date,
        },
      });
    }
  }

  await tx.treasury.update({
    where: { id: 1 },
    data: { balance: { increment: credit } },
  });
}
