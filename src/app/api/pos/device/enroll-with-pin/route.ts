import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  canEnrollPosDevice,
  hashPosDeviceToken,
  issuePosDeviceToken,
} from "@/lib/pos/deviceAuth";

/**
 * POST /api/pos/device/enroll-with-pin
 * Desktop till bootstrap: manager/admin PIN enrolls this terminal and returns the Bearer once.
 * Body: { terminalKey, pin, storeCode?, displayName? }
 */
export async function POST(request: Request) {
  let body: {
    terminalKey?: string;
    pin?: string;
    storeCode?: string;
    displayName?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const terminalKey = String(body.terminalKey ?? "").trim();
  const pin = String(body.pin ?? "").trim();
  if (!terminalKey || terminalKey.length > 80) {
    return NextResponse.json(
      { error: "terminalKey is required" },
      { status: 400 },
    );
  }
  if (!/^\d{4,12}$/.test(pin)) {
    return NextResponse.json(
      { error: "PIN must be 4–12 digits" },
      { status: 400 },
    );
  }

  const manager = await prisma.user.findFirst({
    where: {
      pinCode: pin,
      status: "ACTIVE",
      role: { in: ["ADMIN", "MANAGER"] },
    },
    select: { id: true, username: true, role: true },
  });

  if (!manager || !canEnrollPosDevice(manager.role)) {
    return NextResponse.json(
      { error: "Invalid manager PIN" },
      { status: 401 },
    );
  }

  const storeCode =
    String(body.storeCode ?? "OBOUR").trim().toUpperCase() || "OBOUR";
  const displayName =
    String(body.displayName ?? "").trim() ||
    `كاشير ${terminalKey.slice(0, 8)}`;

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
          enrolledByUserId: manager.id,
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
          enrolledByUserId: manager.id,
        },
      });

  return NextResponse.json({
    ok: true,
    deviceId: device.id,
    terminalKey: device.terminalKey,
    storeCode: device.storeCode,
    displayName: device.displayName,
    token: rawToken,
    enrolledBy: manager.username,
    reenrolled: Boolean(existing),
  });
}
