import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  ensureTreasury,
  roundMoney,
} from "@/lib/treasury/ensureTreasury";
import { logAuditAction } from "@/lib/audit/logAuditAction";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

/**
 * POST /api/treasury/withdraw
 * Manual withdrawal (owner profit / bank transfer) — does not create an expense.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { amount?: number; description?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const amount = roundMoney(Number(body.amount));
  const description =
    typeof body.description === "string" ? body.description.trim() : "";

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "Amount must be greater than 0" },
      { status: 400 },
    );
  }
  if (!description) {
    return NextResponse.json(
      { error: "Description is required" },
      { status: 400 },
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const treasury = await ensureTreasury(tx);

      if (amount > treasury.balance) {
        throw new Error("INSUFFICIENT_FUNDS");
      }

      const transaction = await tx.treasuryTransaction.create({
        data: {
          type: "OUT",
          amount,
          description,
          reference: "MANUAL_WITHDRAWAL",
          date: new Date(),
        },
      });

      const updated = await tx.treasury.update({
        where: { id: 1 },
        data: { balance: { decrement: amount } },
      });

      return { transaction, treasury: updated };
    });

    await logAuditAction(
      session.user.id,
      "WITHDRAW",
      "TREASURY",
      result.transaction.id,
      {
        amount,
        description,
        balanceAfter: result.treasury.balance,
      },
    );

    return NextResponse.json({
      ok: true,
      transaction: {
        id: result.transaction.id,
        type: result.transaction.type,
        amount: result.transaction.amount,
        description: result.transaction.description,
        reference: result.transaction.reference,
        date: result.transaction.date.toISOString(),
      },
      treasury: {
        id: result.treasury.id,
        balance: result.treasury.balance,
        updatedAt: result.treasury.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_FUNDS") {
      return NextResponse.json(
        { error: "Insufficient funds for this withdrawal" },
        { status: 400 },
      );
    }
    console.error("[api/treasury/withdraw]", error);
    return NextResponse.json({ error: "Withdrawal failed" }, { status: 500 });
  }
}
