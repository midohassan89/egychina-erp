import type { Prisma, PrismaClient } from "@prisma/client";

type TxClient = Prisma.TransactionClient | PrismaClient;

/** Default digital payment channel accounts (seeded + ensured at runtime). */
export const DEFAULT_BANK_ACCOUNTS = [
  { code: "visa", name: "CIB Visa" },
  { code: "wallet", name: "Vodafone Cash" },
  { code: "instapay", name: "InstaPay" },
  { code: "wechat", name: "WeChat" },
] as const;

export type BankChannelCode = (typeof DEFAULT_BANK_ACCOUNTS)[number]["code"];

/**
 * Ensure default bank accounts exist (idempotent).
 */
export async function ensureBankAccounts(db: TxClient) {
  const accounts = [];
  for (const def of DEFAULT_BANK_ACCOUNTS) {
    const account = await db.bankAccount.upsert({
      where: { code: def.code },
      create: { code: def.code, name: def.name, balance: 0 },
      update: { name: def.name },
    });
    accounts.push(account);
  }
  return accounts;
}

export async function getBankAccountByCode(
  db: TxClient,
  code: BankChannelCode | string,
) {
  await ensureBankAccounts(db);
  return db.bankAccount.findUnique({ where: { code } });
}
