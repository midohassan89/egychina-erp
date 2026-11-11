import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mapShiftToCashierShift } from "@/lib/shifts/mapShift";
import { roundMoney } from "@/lib/pos/money";
import { resolvePosAccess } from "@/lib/pos/deviceAuth";
import { resolveCashierUserId } from "@/lib/pos/resolveCashierUser";

/**
 * POST /api/shifts/open — open a new POS shift with starting drawer cash.
 * Auth: staff NextAuth session **or** enrolled desktop device Bearer.
 * Device tills should send `cashierUserId` (ERP User.id of the PIN cashier).
 */
export async function POST(request: Request) {
  const access = await resolvePosAccess(request);
  if (!access) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { startingCash?: number; cashierUserId?: string | null };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const startingCash = roundMoney(Number(body.startingCash));
  if (!Number.isFinite(startingCash) || startingCash < 0) {
    return NextResponse.json(
      { error: "Enter a valid starting cash amount" },
      { status: 400 },
    );
  }

  const resolved = await resolveCashierUserId(
    body.cashierUserId,
    access.userId,
  );
  if (resolved.error || !resolved.userId) {
    return NextResponse.json(
      { error: resolved.error ?? "Invalid cashier" },
      { status: 400 },
    );
  }
  const cashierUserId = resolved.userId;

  const existing = await prisma.shift.findFirst({
    where: { userId: cashierUserId, status: "OPEN" },
  });
  if (existing) {
    return NextResponse.json(
      {
        error: "You already have an open shift",
        shift: mapShiftToCashierShift(existing),
      },
      { status: 409 },
    );
  }

  const shift = await prisma.shift.create({
    data: {
      userId: cashierUserId,
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

  return NextResponse.json({
    ok: true,
    shift: mapShiftToCashierShift(shift),
    authKind: access.kind,
  });
}
