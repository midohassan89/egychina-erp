import type { Prisma, PrismaClient } from "@prisma/client";

type TxClient = Prisma.TransactionClient | PrismaClient;

/**
 * Ensure the singleton master safe (id = 1) exists.
 */
export async function ensureTreasury(db: TxClient) {
  return db.treasury.upsert({
    where: { id: 1 },
    create: { id: 1, balance: 0 },
    update: {},
  });
}

export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}
