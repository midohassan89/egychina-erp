import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  ensureTreasury,
  roundMoney,
} from "@/lib/treasury/ensureTreasury";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

/**
 * POST /api/treasury/deposit
 * Manual fund injection (starting capital / owner deposit).
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
      await ensureTreasury(tx);

      const transaction = await tx.treasuryTransaction.create({
        data: {
          type: "IN",
          amount,
          description,
          reference: "MANUAL_DEPOSIT",
          date: new Date(),
        },
      });

      const treasury = await tx.treasury.update({
        where: { id: 1 },
        data: { balance: { increment: amount } },
      });

      return { transaction, treasury };
    });

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
    console.error("[api/treasury/deposit]", error);
    return NextResponse.json({ error: "Deposit failed" }, { status: 500 });
  }
}
