import { createHash, randomBytes, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import type { AppRole } from "@/auth.config";
import { prisma } from "@/lib/prisma";

export type PosAccess =
  | {
      kind: "session";
      userId: string;
      role: AppRole;
      username: string;
    }
  | {
      kind: "device";
      userId: string;
      role: AppRole;
      username: string;
      deviceId: string;
      terminalKey: string;
      storeCode: string;
    };

export function hashPosDeviceToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function issuePosDeviceToken(): string {
  return randomBytes(32).toString("base64url");
}

export function bearerFromRequest(request: Request | NextRequest): string {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() ?? "";
}

function tokensEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  try {
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

export function canEnrollPosDevice(role: string | undefined | null): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

/** Staff browser session (NextAuth) or enrolled desktop device bearer. */
export async function resolvePosAccess(
  request: Request,
): Promise<PosAccess | null> {
  const bearer = bearerFromRequest(request);
  if (bearer) {
    const tokenHash = hashPosDeviceToken(bearer);
    const device = await prisma.posDevice.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        terminalKey: true,
        storeCode: true,
        revokedAt: true,
        enrolledByUserId: true,
        enrolledBy: {
          select: {
            id: true,
            username: true,
            role: true,
            status: true,
          },
        },
      },
    });
    if (!device || device.revokedAt) return null;
    const user = device.enrolledBy;
    if (!user || user.status !== "ACTIVE") return null;

    // Touch lastSeen without failing the request if the write races.
    void prisma.posDevice
      .update({
        where: { id: device.id },
        data: { lastSeenAt: new Date() },
      })
      .catch(() => undefined);

    return {
      kind: "device",
      userId: user.id,
      role: user.role as AppRole,
      username: user.username,
      deviceId: device.id,
      terminalKey: device.terminalKey,
      storeCode: device.storeCode,
    };
  }

  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    kind: "session",
    userId: session.user.id,
    role: (session.user.role as AppRole) ?? "CASHIER",
    username: session.user.name ?? "",
  };
}

/** Re-hash helper for tests — compares a presented token to a stored hash. */
export function posDeviceTokenMatches(
  rawToken: string,
  storedHash: string,
): boolean {
  return tokensEqual(hashPosDeviceToken(rawToken), storedHash);
}
