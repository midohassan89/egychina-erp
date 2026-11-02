import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  isMobilePosRole,
  normalizeMobilePosRole,
  signMobilePosToken,
} from "@/lib/pos/mobilePosAuth";
import {
  mobilePosCorsHeaders,
  mobilePosError,
  mobilePosJson,
  mobilePosOptions,
} from "@/lib/pos/mobilePosCors";
import { mapShiftToCashierShift } from "@/lib/shifts/mapShift";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return mobilePosOptions();
}

/**
 * POST /api/mobile-pos/login
 * Body: { username | usernameOrEmail | email | phone, password }
 * Login id is matched against User.username (schema has no email/phone columns).
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      username?: unknown;
      usernameOrEmail?: unknown;
      email?: unknown;
      phone?: unknown;
      password?: unknown;
    };

    const identifier = String(
      body.usernameOrEmail ??
        body.username ??
        body.email ??
        body.phone ??
        "",
    ).trim();
    const password = String(body.password ?? "");

    if (!identifier || !password) {
      console.log("[mobile-pos/login] missing identifier or password");
      return mobilePosError("يرجى إدخال اسم المستخدم وكلمة المرور", 400);
    }

    // 1) Exact username match
    let user = await prisma.user.findUnique({
      where: { username: identifier },
      select: {
        id: true,
        username: true,
        password: true,
        role: true,
        status: true,
      },
    });

    // 2) Case-insensitive username (SQLite) — also covers email/phone-shaped ids stored in username
    if (!user) {
      const rows = await prisma.$queryRaw<
        {
          id: string;
          username: string;
          password: string;
          role: string;
          status: string;
        }[]
      >`
        SELECT id, username, password, role, status
        FROM User
        WHERE lower(username) = lower(${identifier})
        LIMIT 1
      `;
      const row = rows[0];
      if (row) {
        user = {
          id: row.id,
          username: row.username,
          password: row.password,
          role: row.role as "CASHIER" | "MANAGER" | "ADMIN" | "ACCOUNTANT" | "DRIVER",
          status: row.status,
        };
      }
    }

    if (!user) {
      console.log("[mobile-pos/login] user not found:", identifier);
      return mobilePosError("المستخدم غير موجود", 400);
    }

    if (String(user.status ?? "").toUpperCase() !== "ACTIVE") {
      console.log(
        "[mobile-pos/login] user suspended:",
        user.username,
        user.status,
      );
      return mobilePosError("هذا الحساب موقوف. تواصل مع الإدارة", 400);
    }

    const roleNormalized = normalizeMobilePosRole(String(user.role));
    if (!roleNormalized || !isMobilePosRole(String(user.role))) {
      console.log(
        "[mobile-pos/login] role not allowed:",
        user.username,
        user.role,
      );
      return mobilePosError("عفواً، لا تملك صلاحية الدخول ككاشير", 400);
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      console.log("[mobile-pos/login] bad password for:", user.username);
      return mobilePosError("كلمة المرور غير صحيحة", 400);
    }

    const token = signMobilePosToken(user.id, roleNormalized);
    const openShift = await prisma.shift.findFirst({
      where: { userId: user.id, status: "OPEN" },
    });

    console.log(
      "[mobile-pos/login] success:",
      user.username,
      roleNormalized,
    );

    return NextResponse.json(
      {
        ok: true,
        token,
        user: {
          id: user.id,
          name: user.username,
          role: roleNormalized,
        },
        activeShift: openShift ? mapShiftToCashierShift(openShift) : null,
      },
      { headers: mobilePosCorsHeaders },
    );
  } catch (error) {
    console.error("[api/mobile-pos/login]", error);
    return mobilePosError("تعذر تسجيل الدخول. حاول مرة أخرى", 500);
  }
}
