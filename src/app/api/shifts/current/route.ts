import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mapShiftToCashierShift } from "@/lib/shifts/mapShift";
import { resolvePosAccess } from "@/lib/pos/deviceAuth";
import { resolveCashierUserId } from "@/lib/pos/resolveCashierUser";

/**
 * GET /api/shifts/current — currently OPEN shift for the cashier.
 * Auth: staff session or enrolled desktop device Bearer.
 * Optional query: ?cashierUserId=<ERP User.id>
 */
export async function GET(request: Request) {
  const access = await resolvePosAccess(request);
  if (!access) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const resolved = await resolveCashierUserId(
    searchParams.get("cashierUserId"),
    access.userId,
  );
  if (resolved.error || !resolved.userId) {
    return NextResponse.json(
      { error: resolved.error ?? "Invalid cashier" },
      { status: 400 },
    );
  }

  const shift = await prisma.shift.findFirst({
    where: { userId: resolved.userId, status: "OPEN" },
    orderBy: { startTime: "desc" },
  });

  return NextResponse.json({
    shift: shift ? mapShiftToCashierShift(shift) : null,
    authKind: access.kind,
  });
}
