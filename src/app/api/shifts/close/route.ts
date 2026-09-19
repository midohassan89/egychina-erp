import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { mapShiftToCashierShift } from "@/lib/shifts/mapShift";
import { roundMoney } from "@/lib/pos/money";
import { ensureTreasury } from "@/lib/treasury/ensureTreasury";
import {
  ensureBankAccounts,
  type BankChannelCode,
} from "@/lib/treasury/bankAccounts";

const CHANNEL_ROUTES: {
  code: BankChannelCode;
  field: "visaSales" | "walletSales" | "instapaySales" | "wechatSales";
}[] = [
  { code: "visa", field: "visaSales" },
  { code: "wallet", field: "walletSales" },
  { code: "instapay", field: "instapaySales" },
  { code: "wechat", field: "wechatSales" },
];

/**
 * POST /api/shifts/close
 * Z-Report close: deposit actualCash → Treasury; route digital sales → banks.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { actualCash?: number; shiftId?: number | string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const actualCash = roundMoney(Number(body.actualCash));
  if (!Number.isFinite(actualCash) || actualCash < 0) {
    return NextResponse.json(
      { error: "Enter a valid actual cash count" },
      { status: 400 },
    );
  }

  const openShift = await prisma.shift.findFirst({
    where: {
      userId: session.user.id,
      status: "OPEN",
      ...(body.shiftId != null ? { id: Number(body.shiftId) } : {}),
    },
  });

  if (!openShift) {
    return NextResponse.json({ error: "No open shift to close" }, { status: 404 });
  }

  const expectedCash = roundMoney(
    openShift.startingCash + openShift.cashSales,
  );
  const variance = roundMoney(actualCash - expectedCash);
  const endTime = new Date();
  const cashierName = session.user.name ?? "Cashier";

  try {
    const result = await prisma.$transaction(async (tx) => {
      const closed = await tx.shift.update({
        where: { id: openShift.id },
        data: {
          status: "CLOSED",
          endTime,
          actualCash,
          variance,
        },
      });

      await ensureTreasury(tx);

      await tx.treasuryTransaction.create({
        data: {
          type: "IN",
          amount: actualCash,
          description: `Shift closing deposit — ${cashierName} (Shift #${closed.id})`,
          reference: "POS_SHIFT",
          date: endTime,
        },
      });

      const treasury = await tx.treasury.update({
        where: { id: 1 },
        data: { balance: { increment: actualCash } },
      });

      const banks = await ensureBankAccounts(tx);
      const bankByCode = new Map(banks.map((b) => [b.code, b]));
      const bankDeposits: {
        code: string;
        name: string;
        amount: number;
        balance: number;
      }[] = [];

      for (const route of CHANNEL_ROUTES) {
        const amount = roundMoney(openShift[route.field]);
        if (amount <= 0) continue;

        const account = bankByCode.get(route.code);
        if (!account) continue;

        await tx.bankTransaction.create({
          data: {
            accountId: account.id,
            type: "IN",
            amount,
            reference: `POS_SHIFT_${route.code.toUpperCase()}`,
            date: endTime,
          },
        });

        const updated = await tx.bankAccount.update({
          where: { id: account.id },
          data: { balance: { increment: amount } },
        });

        bankDeposits.push({
          code: account.code,
          name: account.name,
          amount,
          balance: updated.balance,
        });
      }

      return { closed, treasuryBalance: treasury.balance, bankDeposits };
    });

    return NextResponse.json({
      ok: true,
      shift: mapShiftToCashierShift(result.closed),
      expectedCash,
      actualCash,
      variance,
      treasuryBalance: result.treasuryBalance,
      bankDeposits: result.bankDeposits,
    });
  } catch (error) {
    console.error("[api/shifts/close]", error);
    return NextResponse.json({ error: "Could not close shift" }, { status: 500 });
  }
}
