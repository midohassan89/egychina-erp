import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  isMobilePosRole,
  signMobilePosToken,
  type MobilePosRole,
} from "@/lib/pos/mobilePosAuth";
import { mapShiftToCashierShift } from "@/lib/shifts/mapShift";

/**
 * POST /api/mobile-pos/login
 * Body: { username, password }
 * Returns bearer token for CASHIER / MANAGER / ADMIN.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      username?: unknown;
      password?: unknown;
    };
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");

    if (!username || !password) {
      return NextResponse.json(
        { error: "username and password are required" },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || user.status !== "ACTIVE" || !isMobilePosRole(user.role)) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const role = user.role as MobilePosRole;
    const token = signMobilePosToken(user.id, role);

    const openShift = await prisma.shift.findFirst({
      where: { userId: user.id, status: "OPEN" },
    });

    return NextResponse.json({
      ok: true,
      token,
      user: {
        id: user.id,
        name: user.username,
        role,
      },
      activeShift: openShift ? mapShiftToCashierShift(openShift) : null,
    });
  } catch (error) {
    console.error("[api/mobile-pos/login]", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
