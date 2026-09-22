import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  buildShiftZReport,
  mapShiftToCashierShift,
} from "@/lib/shifts/mapShift";

function requireViewer(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

/**
 * GET /api/shifts — historical POS shifts / Z-Reports archive.
 * Optional ?id= for a single shift with full Z-Report payload.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireViewer(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const idParam = searchParams.get("id");

  if (idParam) {
    const id = Number(idParam);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid shift id" }, { status: 400 });
    }
    const shift = await prisma.shift.findUnique({
      where: { id },
      include: { user: { select: { id: true, username: true } } },
    });
    if (!shift) {
      return NextResponse.json({ error: "Shift not found" }, { status: 404 });
    }
    const mapped = mapShiftToCashierShift(shift);
    const report = buildShiftZReport(
      shift,
      shift.endTime?.toISOString() ?? new Date().toISOString(),
    );
    return NextResponse.json({
      shift: {
        ...mapped,
        cashierId: shift.userId,
        cashierName: shift.user.username,
        status: shift.status,
      },
      report: {
        ...report,
        cashierName: shift.user.username,
      },
    });
  }

  const shifts = await prisma.shift.findMany({
    include: { user: { select: { id: true, username: true } } },
    orderBy: [{ endTime: "desc" }, { startTime: "desc" }, { id: "desc" }],
    take: 500,
  });

  return NextResponse.json({
    shifts: shifts.map((s) => {
      const mapped = mapShiftToCashierShift(s);
      return {
        id: s.id,
        shiftId: mapped.id,
        cashierId: s.userId,
        cashierName: s.user.username,
        startedAt: mapped.startedAt,
        endedAt: mapped.endedAt,
        status: s.status,
        startingCash: mapped.startingCash,
        totalSales: mapped.totalSales ?? 0,
        cashSales: mapped.cashSales ?? 0,
        visaSales: mapped.visaSales ?? 0,
        walletSales: mapped.walletSales ?? 0,
        instapaySales: mapped.instapaySales ?? 0,
        wechatSales: mapped.wechatSales ?? 0,
        expectedCash: mapped.expectedCash ?? 0,
        actualCash: mapped.actualCash ?? null,
        variance: mapped.variance ?? null,
        ticketCount: mapped.ticketCount ?? 0,
      };
    }),
    count: shifts.length,
  });
}
