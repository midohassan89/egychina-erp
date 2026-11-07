import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canEnrollPosDevice } from "@/lib/pos/deviceAuth";

/**
 * POST /api/pos/device/revoke
 * Manager/Admin session only.
 * Body: { deviceId } or { terminalKey, storeCode? }
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id || !canEnrollPosDevice(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    deviceId?: string;
    terminalKey?: string;
    storeCode?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const deviceId = String(body.deviceId ?? "").trim();
  const terminalKey = String(body.terminalKey ?? "").trim();
  const storeCode =
    String(body.storeCode ?? "OBOUR").trim().toUpperCase() || "OBOUR";

  const device = deviceId
    ? await prisma.posDevice.findUnique({ where: { id: deviceId } })
    : terminalKey
      ? await prisma.posDevice.findUnique({
          where: {
            storeCode_terminalKey: { storeCode, terminalKey },
          },
        })
      : null;

  if (!device) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  if (device.revokedAt) {
    return NextResponse.json({
      ok: true,
      alreadyRevoked: true,
      deviceId: device.id,
      revokedAt: device.revokedAt.toISOString(),
    });
  }

  const updated = await prisma.posDevice.update({
    where: { id: device.id },
    data: { revokedAt: new Date() },
  });

  return NextResponse.json({
    ok: true,
    alreadyRevoked: false,
    deviceId: updated.id,
    revokedAt: updated.revokedAt!.toISOString(),
  });
}
