import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePosAccess } from "@/lib/pos/deviceAuth";

/**
 * GET /api/pos/staff
 * Enrolled desktop device only. Returns active staff accounts + PIN for offline till login.
 * PIN is never logged; transit is HTTPS + device bearer.
 */
export async function GET(request: Request) {
  const access = await resolvePosAccess(request);
  if (!access || access.kind !== "device") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      role: { in: ["CASHIER", "ACCOUNTANT", "MANAGER", "ADMIN"] },
      pinCode: { not: null },
    },
    orderBy: { username: "asc" },
    select: {
      id: true,
      username: true,
      role: true,
      status: true,
      pinCode: true,
    },
  });

  return NextResponse.json({
    staff: users
      .filter((u) => typeof u.pinCode === "string" && /^\d{4,12}$/.test(u.pinCode))
      .map((u) => ({
        id: u.id,
        username: u.username,
        role: u.role,
        status: u.status,
        pinCode: u.pinCode,
      })),
  });
}
