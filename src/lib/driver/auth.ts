import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

type DriverTokenPayload = {
  sub: string;
  role: "DRIVER";
  exp: number;
};

function secret(): string {
  return process.env.AUTH_SECRET ?? "dev-driver-secret";
}

export function signDriverToken(userId: string): string {
  const payload: DriverTokenPayload = {
    sub: userId,
    role: "DRIVER",
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyDriverToken(token: string): DriverTokenPayload | null {
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
    ) as DriverTokenPayload;
    if (payload.role !== "DRIVER" || !payload.sub) return null;
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

/** Resolve authenticated DRIVER user from Bearer token. */
export async function requireDriver(request: Request) {
  const token = bearerFromRequest(request);
  const payload = verifyDriverToken(token);
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
  if (!user || user.status !== "ACTIVE" || user.role !== "DRIVER") return null;
  return user;
}

export const DRIVER_CATEGORIES = [
  "FUEL",
  "TOLL",
  "OIL",
  "MAINTENANCE",
] as const;

export type DriverExpenseCategory = (typeof DRIVER_CATEGORIES)[number];

export function isDriverCategory(value: string): value is DriverExpenseCategory {
  return (DRIVER_CATEGORIES as readonly string[]).includes(value);
}
