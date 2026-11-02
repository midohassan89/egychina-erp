import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  isMobileAdminRole,
  type MobileAdminRole,
} from "@/lib/pos/mobileAdminAuth";
import {
  normalizeMobilePosRole,
  signMobilePosToken,
} from "@/lib/pos/mobilePosAuth";
import {
  mobilePosCorsHeaders,
  mobilePosError,
  mobilePosOptions,
} from "@/lib/pos/mobilePosCors";
import { MOBILE_ADMIN_MODULES } from "@/lib/mobile-admin/handlers";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return mobilePosOptions();
}

/**
 * POST /api/mobile-admin/login
 * Body: { username | usernameOrEmail | email | phone, password }
 * Only ACTIVE ADMIN / MANAGER may obtain a Mobile Admin ERP token.
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
      return mobilePosError("يرجى إدخال اسم المستخدم وكلمة المرور", 400);
    }

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
      return mobilePosError("المستخدم غير موجود", 400);
    }

    if (String(user.status ?? "").toUpperCase() !== "ACTIVE") {
      return mobilePosError("هذا الحساب موقوف. تواصل مع الإدارة", 400);
    }

    const roleNormalized = normalizeMobilePosRole(String(user.role));
    if (!roleNormalized || !isMobileAdminRole(roleNormalized)) {
      return mobilePosError(
        "عفواً، لا تملك صلاحية الدخول لتطبيق الإدارة",
        403,
      );
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return mobilePosError("كلمة المرور غير صحيحة", 400);
    }

    const role = roleNormalized as MobileAdminRole;
    const token = signMobilePosToken(user.id, role);

    return NextResponse.json(
      {
        ok: true,
        token,
        user: {
          id: user.id,
          name: user.username,
          role,
        },
        modules: MOBILE_ADMIN_MODULES,
      },
      { headers: mobilePosCorsHeaders },
    );
  } catch (error) {
    console.error("[api/mobile-admin/login]", error);
    return mobilePosError("تعذر تسجيل الدخول. حاول مرة أخرى", 500);
  }
}
