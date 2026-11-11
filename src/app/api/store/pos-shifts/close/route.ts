import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mapShiftToCashierShift } from "@/lib/shifts/mapShift";
import { roundMoney } from "@/lib/pos/money";
import { ensureTreasury } from "@/lib/treasury/ensureTreasury";
import {
  ensureBankAccounts,
  type BankChannelCode,
} from "@/lib/treasury/bankAccounts";
import { resolveCashierUserId } from "@/lib/pos/resolveCashierUser";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

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
 * POST /api/store/pos-shifts/close
 * Desktop Z-close without device Bearer (same trust model as store checkout).
 * Body: { actualCash, cashierUserId, shiftId? }
 */
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    let body: {
      actualCash?: number;
      shiftId?: number | string;
      cashierUserId?: string | null;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400, headers: corsHeaders },
      );
    }

    const cashierRaw = body.cashierUserId?.trim() ?? "";
    if (!cashierRaw) {
      return NextResponse.json(
        { error: "cashierUserId is required" },
        { status: 400, headers: corsHeaders },
      );
    }

    const resolved = await resolveCashierUserId(cashierRaw, cashierRaw);
    if (resolved.error || !resolved.userId) {
      return NextResponse.json(
        { error: resolved.error ?? "Invalid cashier" },
        { status: 400, headers: corsHeaders },
      );
    }

    const actualCash = roundMoney(Number(body.actualCash));
    if (!Number.isFinite(actualCash) || actualCash < 0) {
      return NextResponse.json(
        { error: "Enter a valid actual cash count" },
        { status: 400, headers: corsHeaders },
      );
    }

    const openShift = await prisma.shift.findFirst({
      where: {
        userId: resolved.userId,
        status: "OPEN",
        ...(body.shiftId != null ? { id: Number(body.shiftId) } : {}),
      },
    });
    if (!openShift) {
      return NextResponse.json(
        { error: "No open shift to close" },
        { status: 404, headers: corsHeaders },
      );
    }

    const expectedCash = roundMoney(openShift.startingCash + openShift.cashSales);
    const variance = roundMoney(actualCash - expectedCash);
    const endTime = new Date();
    const cashier = await prisma.user.findUnique({
      where: { id: resolved.userId },
      select: { username: true },
    });
    const cashierName = cashier?.username ?? "Cashier";

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

    return NextResponse.json(
      {
        ok: true,
        shift: mapShiftToCashierShift(result.closed),
        expectedCash,
        actualCash,
        variance,
        treasuryBalance: result.treasuryBalance,
        bankDeposits: result.bankDeposits,
        authKind: "store-pos",
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("[api/store/pos-shifts/close]", error);
    return NextResponse.json(
      { error: "Could not close shift" },
      { status: 500, headers: corsHeaders },
    );
  }
}
