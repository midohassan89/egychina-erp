import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { mapShiftToCashierShift } from "@/lib/shifts/mapShift";
import { roundMoney } from "@/lib/pos/money";

/**
 * POST /api/shifts/open — open a new POS shift with starting drawer cash.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { startingCash?: number };
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

  const existing = await prisma.shift.findFirst({
    where: { userId: session.user.id, status: "OPEN" },
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
      userId: session.user.id,
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
  });
}
