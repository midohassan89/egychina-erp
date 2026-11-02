import {
  requireMobilePos,
  type MobilePosRole,
} from "@/lib/pos/mobilePosAuth";

/**
 * Mobile Admin ERP roles — same Bearer JWT as mobile-pos login.
 * CASHIER / MANAGER / ADMIN may read and operate on /api/mobile-admin/*.
 */
export type MobileAdminRole = MobilePosRole;

export function isMobileAdminRole(role: string): role is MobileAdminRole {
  const normalized = String(role ?? "").trim().toUpperCase();
  return (
    normalized === "ADMIN" ||
    normalized === "MANAGER" ||
    normalized === "CASHIER"
  );
}

/**
 * Same token verification as /api/mobile-pos/* (verifyMobilePosToken + ACTIVE user).
 * Accepts the ordinary mobile-pos login token immediately.
 */
export async function requireMobileAdmin(request: Request) {
  const user = await requireMobilePos(request);
  if (!user) return null;
  if (!isMobileAdminRole(user.role)) return null;
  return user;
}

export type MobileAdminUser = NonNullable<
  Awaited<ReturnType<typeof requireMobileAdmin>>
>;
