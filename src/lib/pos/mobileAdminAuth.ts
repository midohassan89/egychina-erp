import { prisma } from "@/lib/prisma";
import {
  bearerFromRequest,
  normalizeMobilePosRole,
  verifyMobilePosToken,
  type MobilePosRole,
} from "@/lib/pos/mobilePosAuth";

export type MobileAdminRole = "ADMIN" | "MANAGER";

export function isMobileAdminRole(role: string): role is MobileAdminRole {
  const normalized = String(role ?? "").trim().toUpperCase();
  return normalized === "ADMIN" || normalized === "MANAGER";
}

/**
 * Require Bearer JWT from mobile-pos/mobile-admin login.
 * Only ACTIVE ADMIN or MANAGER users may access Mobile Admin ERP APIs.
 */
export async function requireMobileAdmin(request: Request) {
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
  if (!role || !isMobileAdminRole(role)) {
    return null;
  }

  return {
    id: user.id,
    name: user.username,
    role: role as MobileAdminRole,
  };
}

export type MobileAdminUser = NonNullable<
  Awaited<ReturnType<typeof requireMobileAdmin>>
>;
