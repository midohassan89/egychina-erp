import type { Prisma, PrismaClient } from "@prisma/client";
import { ensureTreasury, roundMoney } from "@/lib/treasury/ensureTreasury";
import { ensureBankAccounts } from "@/lib/treasury/bankAccounts";

type TxClient = Prisma.TransactionClient | PrismaClient;

export type PaymentSourceType = "TREASURY" | "BANK";

/**
 * Debit either the physical Treasury or a BankAccount.
 * Creates the matching OUT ledger row.
 */
export async function debitPaymentSource(
  tx: TxClient,
  opts: {
    sourceType: PaymentSourceType;
    bankAccountId?: number | null;
    amount: number;
    reference: string;
    description: string;
    date: Date;
  },
): Promise<{
  sourceType: PaymentSourceType;
  bankAccountId: number | null;
  bankAccountName: string | null;
  treasuryBalance: number | null;
  bankBalance: number | null;
}> {
  const amount = roundMoney(opts.amount);

  if (opts.sourceType === "BANK" && opts.bankAccountId) {
    await ensureBankAccounts(tx);
    const account = await tx.bankAccount.findUnique({
      where: { id: opts.bankAccountId },
    });
    if (!account) {
      throw new Error("Bank account not found");
    }
    if (account.balance + 0.001 < amount) {
      throw new Error(
        `Insufficient ${account.name} balance (have ${account.balance.toFixed(2)}, need ${amount.toFixed(2)})`,
      );
    }

    await tx.bankTransaction.create({
      data: {
        accountId: account.id,
        type: "OUT",
        amount,
        reference: opts.reference,
        date: opts.date,
      },
    });

    const updated = await tx.bankAccount.update({
      where: { id: account.id },
      data: { balance: { decrement: amount } },
    });

    return {
      sourceType: "BANK",
      bankAccountId: account.id,
      bankAccountName: account.name,
      treasuryBalance: null,
      bankBalance: updated.balance,
    };
  }

  const treasury = await ensureTreasury(tx);
  if (treasury.balance + 0.001 < amount) {
    throw new Error(
      `Insufficient treasury balance (have ${treasury.balance.toFixed(2)}, need ${amount.toFixed(2)})`,
    );
  }

  await tx.treasuryTransaction.create({
    data: {
      type: "OUT",
      amount,
      description: opts.description,
      reference: opts.reference,
      date: opts.date,
    },
  });

  const updatedTreasury = await tx.treasury.update({
    where: { id: 1 },
    data: { balance: { decrement: amount } },
  });

  return {
    sourceType: "TREASURY",
    bankAccountId: null,
    bankAccountName: null,
    treasuryBalance: updatedTreasury.balance,
    bankBalance: null,
  };
}

export function parsePaymentSource(body: {
  sourceType?: string;
  bankAccountId?: number | null;
}): { sourceType: PaymentSourceType; bankAccountId: number | null } {
  const raw = (body.sourceType ?? "TREASURY").toUpperCase();
  if (raw === "BANK") {
    const id = Number(body.bankAccountId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error("Select a bank account");
    }
    return { sourceType: "BANK", bankAccountId: id };
  }
  return { sourceType: "TREASURY", bankAccountId: null };
}
