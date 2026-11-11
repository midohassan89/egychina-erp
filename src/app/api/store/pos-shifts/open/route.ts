import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mapShiftToCashierShift } from "@/lib/shifts/mapShift";
import { roundMoney } from "@/lib/pos/money";
import { resolveCashierUserId } from "@/lib/pos/resolveCashierUser";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * POST /api/store/pos-shifts/open
 * Desktop till shift open without device Bearer (same trust model as /api/store/pos-checkout).
 * Body: { startingCash, cashierUserId } — cashierUserId is required.
 */
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    let body: { startingCash?: number; cashierUserId?: string | null };
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

    const startingCash = roundMoney(Number(body.startingCash));
    if (!Number.isFinite(startingCash) || startingCash < 0) {
      return NextResponse.json(
        { error: "Enter a valid starting cash amount" },
        { status: 400, headers: corsHeaders },
      );
    }

    const existing = await prisma.shift.findFirst({
      where: { userId: resolved.userId, status: "OPEN" },
    });
    if (existing) {
      return NextResponse.json(
        {
          error: "You already have an open shift",
          shift: mapShiftToCashierShift(existing),
          authKind: "store-pos",
        },
        { status: 409, headers: corsHeaders },
      );
    }

    const shift = await prisma.shift.create({
      data: {
        userId: resolved.userId,
        startingCash,
        cashSales: 0,
        visaSales: 0,
        walletSales: 0,
        instapaySales: 0,
        wechatSales: 0,
        tickets: 0,
        status: "OPEN",
      },
    });

    return NextResponse.json(
      {
        ok: true,
        shift: mapShiftToCashierShift(shift),
        authKind: "store-pos",
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("[api/store/pos-shifts/open]", error);
    return NextResponse.json(
      { error: "Could not open shift" },
      { status: 500, headers: corsHeaders },
    );
  }
}
