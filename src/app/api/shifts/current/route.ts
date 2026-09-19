import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { mapShiftToCashierShift } from "@/lib/shifts/mapShift";

/**
 * GET /api/shifts/current — currently OPEN shift for this user.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shift = await prisma.shift.findFirst({
    where: { userId: session.user.id, status: "OPEN" },
    orderBy: { startTime: "desc" },
  });

  return NextResponse.json({
    shift: shift ? mapShiftToCashierShift(shift) : null,
  });
}
