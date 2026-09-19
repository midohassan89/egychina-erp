import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureTreasury } from "@/lib/treasury/ensureTreasury";
import { ensureBankAccounts } from "@/lib/treasury/bankAccounts";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

/** GET /api/treasury — cash balance, bank accounts, cash ledger */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const treasury = await ensureTreasury(prisma);
  const bankAccounts = await ensureBankAccounts(prisma);
  const transactions = await prisma.treasuryTransaction.findMany({
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: 200,
  });
  const transfers = await prisma.internalTransfer.findMany({
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: 50,
  });

  return NextResponse.json({
    treasury: {
      id: treasury.id,
      balance: treasury.balance,
      updatedAt: treasury.updatedAt.toISOString(),
    },
    bankAccounts: bankAccounts.map((b) => ({
      id: b.id,
      name: b.name,
      code: b.code,
      balance: b.balance,
      updatedAt: b.updatedAt.toISOString(),
    })),
    transactions: transactions.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      description: t.description,
      reference: t.reference,
      date: t.date.toISOString(),
    })),
    transfers: transfers.map((t) => ({
      id: t.id,
      fromType: t.fromType,
      fromAccountId: t.fromAccountId,
      toType: t.toType,
      toAccountId: t.toAccountId,
      amount: t.amount,
      date: t.date.toISOString(),
    })),
  });
}
