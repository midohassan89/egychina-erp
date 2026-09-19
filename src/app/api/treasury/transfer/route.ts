import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  ensureTreasury,
  roundMoney,
} from "@/lib/treasury/ensureTreasury";
import { ensureBankAccounts } from "@/lib/treasury/bankAccounts";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

type AccountType = "TREASURY" | "BANK";

/**
 * POST /api/treasury/transfer
 * Move funds between Main Treasury Cash and bank accounts (or bank ↔ bank).
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    fromType?: string;
    fromAccountId?: number | null;
    toType?: string;
    toAccountId?: number | null;
    amount?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const fromType = String(body.fromType ?? "").toUpperCase() as AccountType;
  const toType = String(body.toType ?? "").toUpperCase() as AccountType;
  const amount = roundMoney(Number(body.amount));
  const fromAccountId =
    body.fromAccountId != null ? Number(body.fromAccountId) : null;
  const toAccountId =
    body.toAccountId != null ? Number(body.toAccountId) : null;

  if (fromType !== "TREASURY" && fromType !== "BANK") {
    return NextResponse.json({ error: "Invalid source" }, { status: 400 });
  }
  if (toType !== "TREASURY" && toType !== "BANK") {
    return NextResponse.json({ error: "Invalid destination" }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "Amount must be greater than 0" },
      { status: 400 },
    );
  }
  if (fromType === "BANK" && (!fromAccountId || fromAccountId <= 0)) {
    return NextResponse.json({ error: "Select source bank account" }, { status: 400 });
  }
  if (toType === "BANK" && (!toAccountId || toAccountId <= 0)) {
    return NextResponse.json(
      { error: "Select destination bank account" },
      { status: 400 },
    );
  }
  if (
    fromType === toType &&
    fromType === "TREASURY"
  ) {
    return NextResponse.json(
      { error: "Cannot transfer Treasury to itself" },
      { status: 400 },
    );
  }
  if (
    fromType === "BANK" &&
    toType === "BANK" &&
    fromAccountId === toAccountId
  ) {
    return NextResponse.json(
      { error: "Cannot transfer an account to itself" },
      { status: 400 },
    );
  }

  const now = new Date();

  try {
    const result = await prisma.$transaction(async (tx) => {
      await ensureTreasury(tx);
      await ensureBankAccounts(tx);

      // --- Debit source ---
      let fromLabel = "Main Treasury Cash";
      if (fromType === "TREASURY") {
        const treasury = await tx.treasury.findUniqueOrThrow({ where: { id: 1 } });
        if (treasury.balance + 0.001 < amount) {
          throw new Error("Insufficient funds for this transfer");
        }
        await tx.treasuryTransaction.create({
          data: {
            type: "OUT",
            amount,
            description: `Internal transfer out → ${toType === "TREASURY" ? "Treasury" : `Bank #${toAccountId}`}`,
            reference: "INTERNAL_TRANSFER",
            date: now,
          },
        });
        await tx.treasury.update({
          where: { id: 1 },
          data: { balance: { decrement: amount } },
        });
      } else {
        const account = await tx.bankAccount.findUnique({
          where: { id: fromAccountId! },
        });
        if (!account) throw new Error("Source bank account not found");
        if (account.balance + 0.001 < amount) {
          throw new Error("Insufficient funds for this transfer");
        }
        fromLabel = account.name;
        await tx.bankTransaction.create({
          data: {
            accountId: account.id,
            type: "OUT",
            amount,
            reference: "INTERNAL_TRANSFER",
            date: now,
          },
        });
        await tx.bankAccount.update({
          where: { id: account.id },
          data: { balance: { decrement: amount } },
        });
      }

      // --- Credit destination ---
      let toLabel = "Main Treasury Cash";
      if (toType === "TREASURY") {
        await tx.treasuryTransaction.create({
          data: {
            type: "IN",
            amount,
            description: `Internal transfer in ← ${fromLabel}`,
            reference: "INTERNAL_TRANSFER",
            date: now,
          },
        });
        await tx.treasury.update({
          where: { id: 1 },
          data: { balance: { increment: amount } },
        });
      } else {
        const account = await tx.bankAccount.findUnique({
          where: { id: toAccountId! },
        });
        if (!account) throw new Error("Destination bank account not found");
        toLabel = account.name;
        await tx.bankTransaction.create({
          data: {
            accountId: account.id,
            type: "IN",
            amount,
            reference: "INTERNAL_TRANSFER",
            date: now,
          },
        });
        await tx.bankAccount.update({
          where: { id: account.id },
          data: { balance: { increment: amount } },
        });
      }

      // Fix treasury OUT description now that we know toLabel
      if (fromType === "TREASURY") {
        // already wrote a generic description; fine
      }

      const transfer = await tx.internalTransfer.create({
        data: {
          fromType,
          fromAccountId: fromType === "BANK" ? fromAccountId : null,
          toType,
          toAccountId: toType === "BANK" ? toAccountId : null,
          amount,
          date: now,
        },
      });

      const treasury = await tx.treasury.findUniqueOrThrow({ where: { id: 1 } });
      const banks = await tx.bankAccount.findMany({ orderBy: { id: "asc" } });

      return {
        transfer,
        fromLabel,
        toLabel,
        treasury,
        banks,
      };
    });

    return NextResponse.json({
      ok: true,
      transfer: {
        id: result.transfer.id,
        fromType: result.transfer.fromType,
        fromAccountId: result.transfer.fromAccountId,
        toType: result.transfer.toType,
        toAccountId: result.transfer.toAccountId,
        amount: result.transfer.amount,
        date: result.transfer.date.toISOString(),
        fromLabel: result.fromLabel,
        toLabel: result.toLabel,
      },
      treasury: {
        id: result.treasury.id,
        balance: result.treasury.balance,
        updatedAt: result.treasury.updatedAt.toISOString(),
      },
      bankAccounts: result.banks.map((b) => ({
        id: b.id,
        name: b.name,
        code: b.code,
        balance: b.balance,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Transfer failed";
    const status =
      message.startsWith("Insufficient") || message.includes("not found")
        ? 400
        : 500;
    if (status === 500) console.error("[api/treasury/transfer]", error);
    return NextResponse.json({ error: message }, { status });
  }
}
