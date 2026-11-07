import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canEnrollPosDevice } from "@/lib/pos/deviceAuth";

/** GET /api/pos/device?storeCode=OBOUR — list tills (no token hashes). */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id || !canEnrollPosDevice(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const storeCode =
    searchParams.get("storeCode")?.trim().toUpperCase() || "OBOUR";

  const devices = await prisma.posDevice.findMany({
    where: { storeCode },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      terminalKey: true,
      storeCode: true,
      displayName: true,
      revokedAt: true,
      lastSeenAt: true,
      createdAt: true,
      enrolledBy: { select: { id: true, username: true } },
    },
  });

  return NextResponse.json({
    storeCode,
    devices: devices.map((row) => ({
      ...row,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      active: row.revokedAt == null,
    })),
  });
}
