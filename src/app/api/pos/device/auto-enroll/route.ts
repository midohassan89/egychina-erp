import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  hashPosDeviceToken,
  issuePosDeviceToken,
} from "@/lib/pos/deviceAuth";

/**
 * Ensures PosDevice exists on older production DBs that never ran db push
 * after the desktop till model was added.
 */
async function ensurePosDeviceTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PosDevice" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "terminalKey" TEXT NOT NULL,
      "storeCode" TEXT NOT NULL DEFAULT 'OBOUR',
      "displayName" TEXT NOT NULL,
      "tokenHash" TEXT NOT NULL,
      "enrolledByUserId" TEXT NOT NULL,
      "revokedAt" DATETIME,
      "lastSeenAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "PosDevice_enrolledByUserId_fkey"
        FOREIGN KEY ("enrolledByUserId") REFERENCES "User" ("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "PosDevice_tokenHash_key" ON "PosDevice"("tokenHash")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "PosDevice_storeCode_terminalKey_key" ON "PosDevice"("storeCode", "terminalKey")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "PosDevice_storeCode_revokedAt_idx" ON "PosDevice"("storeCode", "revokedAt")`,
  );
}

/**
 * POST /api/pos/device/auto-enroll
 * Silent till bootstrap (no manager PIN). Desktop POS calls this once like a
 * catalog pull — then uses the bearer for checkout.
 * Body: { terminalKey, storeCode?, displayName? }
 */
export async function POST(request: Request) {
  try {
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

    await ensurePosDeviceTable();

    const owner = await prisma.user.findFirst({
      where: {
        status: "ACTIVE",
        role: { in: ["ADMIN", "MANAGER"] },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, username: true },
    });
    if (!owner) {
      return NextResponse.json(
        { error: "No active ADMIN/MANAGER account to own the till" },
        { status: 500 },
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
            enrolledByUserId: owner.id,
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
            enrolledByUserId: owner.id,
          },
        });

    return NextResponse.json({
      ok: true,
      deviceId: device.id,
      terminalKey: device.terminalKey,
      storeCode: device.storeCode,
      displayName: device.displayName,
      token: rawToken,
      enrolledBy: owner.username,
      reenrolled: Boolean(existing),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[api/pos/device/auto-enroll]", error);
    return NextResponse.json(
      { error: "Could not enroll device", detail },
      { status: 500 },
    );
  }
}
