import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  canEnrollPosDevice,
  hashPosDeviceToken,
  issuePosDeviceToken,
} from "@/lib/pos/deviceAuth";

/**
 * POST /api/pos/device/enroll
 * Manager/Admin session only. Returns the raw bearer token once.
 * Body: { terminalKey, storeCode?, displayName? }
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id || !canEnrollPosDevice(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    terminalKey?: string;
    storeCode?: string;
    displayName?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const terminalKey = String(body.terminalKey ?? "").trim();
  if (!terminalKey || terminalKey.length > 80) {
    return NextResponse.json(
      { error: "terminalKey is required" },
      { status: 400 },
    );
  }

  const storeCode = String(body.storeCode ?? "OBOUR").trim().toUpperCase() || "OBOUR";
  const displayName =
    String(body.displayName ?? "").trim() || `كاشير ${terminalKey.slice(0, 8)}`;

  const rawToken = issuePosDeviceToken();
  const tokenHash = hashPosDeviceToken(rawToken);

  const existing = await prisma.posDevice.findUnique({
    where: {
      storeCode_terminalKey: { storeCode, terminalKey },
    },
  });

  const device = existing
    ? await prisma.posDevice.update({
        where: { id: existing.id },
        data: {
          displayName,
          tokenHash,
          enrolledByUserId: session.user.id,
          revokedAt: null,
          lastSeenAt: null,
        },
      })
    : await prisma.posDevice.create({
        data: {
          terminalKey,
          storeCode,
          displayName,
          tokenHash,
          enrolledByUserId: session.user.id,
        },
      });

  return NextResponse.json({
    ok: true,
    deviceId: device.id,
    terminalKey: device.terminalKey,
    storeCode: device.storeCode,
    displayName: device.displayName,
    /** Show once. Store on the till via DPAPI — never in git or logs. */
    token: rawToken,
    reenrolled: Boolean(existing),
  });
}
