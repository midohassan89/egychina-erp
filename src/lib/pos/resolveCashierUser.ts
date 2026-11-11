import { prisma } from "@/lib/prisma";

const POS_ROLES = ["CASHIER", "ACCOUNTANT", "MANAGER", "ADMIN"] as const;

/**
 * Resolves which ERP User owns a till shift / sale attribution.
 * Desktop POS sends the logged-in staff id (same cuid as /api/store/pos-staff).
 */
export async function resolveCashierUserId(
  preferredId: string | null | undefined,
  fallbackUserId: string,
): Promise<{ userId: string; error?: undefined } | { userId?: undefined; error: string }> {
  const trimmed = preferredId?.trim() ?? "";
  if (!trimmed) {
    return { userId: fallbackUserId };
  }

  const user = await prisma.user.findUnique({
    where: { id: trimmed },
    select: { id: true, status: true, role: true },
  });
  if (!user || user.status !== "ACTIVE") {
    return { error: "Cashier not found or inactive" };
  }
  if (!POS_ROLES.includes(user.role as (typeof POS_ROLES)[number])) {
    return { error: "User cannot operate POS shifts" };
  }
  return { userId: user.id };
}
