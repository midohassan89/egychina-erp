import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { canUsePos } from "@/lib/auth/roles";

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type MobilePosRole = "CASHIER" | "MANAGER" | "ADMIN";

type MobilePosTokenPayload = {
  sub: string;
  role: MobilePosRole;
  exp: number;
};

function secret(): string {
  return process.env.AUTH_SECRET ?? "dev-mobile-pos-secret";
}

export function isMobilePosRole(role: string): role is MobilePosRole {
  const normalized = String(role ?? "").trim().toUpperCase();
  return (
    normalized === "CASHIER" ||
    normalized === "MANAGER" ||
    normalized === "ADMIN" ||
    canUsePos(normalized)
  );
}

export function normalizeMobilePosRole(role: string): MobilePosRole | null {
  const normalized = String(role ?? "").trim().toUpperCase();
  if (
    normalized === "CASHIER" ||
    normalized === "MANAGER" ||
    normalized === "ADMIN"
  ) {
    return normalized;
  }
  return null;
}

export function signMobilePosToken(
  userId: string,
  role: MobilePosRole,
): string {
  const payload: MobilePosTokenPayload = {
    sub: userId,
    role,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyMobilePosToken(
  token: string,
): MobilePosTokenPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as MobilePosTokenPayload;
    if (!payload.sub || !isMobilePosRole(payload.role)) return null;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function bearerFromRequest(request: Request | NextRequest): string {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() ?? "";
}

/** Resolve authenticated mobile POS user (CASHIER / MANAGER / ADMIN). */
export async function requireMobilePos(request: Request) {
  const token = bearerFromRequest(request);
  const payload = verifyMobilePosToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      username: true,
      role: true,
      status: true,
    },
  });
  if (!user || String(user.status).toUpperCase() !== "ACTIVE") {
    return null;
  }
  const role = normalizeMobilePosRole(String(user.role));
  if (!role || !isMobilePosRole(String(user.role))) {
    return null;
  }
  return {
    id: user.id,
    name: user.username,
    role,
  };
}
