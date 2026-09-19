import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ALL_ROLES, canManageUsers } from "@/lib/auth/roles";
import { logAuditAction } from "@/lib/audit/logAuditAction";
import type { AppRole } from "@/auth.config";

function requireUsersManager(role?: string) {
  return canManageUsers(role);
}

/**
 * GET /api/users — list all staff accounts (ADMIN / MANAGER).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireUsersManager(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      username: true,
      role: true,
      status: true,
      pinCode: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      status: u.status,
      hasPin: !!u.pinCode,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
    })),
  });
}

/**
 * POST /api/users — create a staff account (ADMIN / MANAGER).
 * Body: { username, password, role, pinCode? }
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireUsersManager(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    username?: string;
    password?: string;
    role?: string;
    pinCode?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const role = (body.role ?? "CASHIER") as AppRole;
  const pinRaw =
    typeof body.pinCode === "string" ? body.pinCode.trim() : "";

  if (!username || username.length < 2) {
    return NextResponse.json(
      { error: "Username must be at least 2 characters" },
      { status: 400 },
    );
  }
  if (!password || password.length < 4) {
    return NextResponse.json(
      { error: "Password must be at least 4 characters" },
      { status: 400 },
    );
  }
  if (!(ALL_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  let pinCode: string | null = null;
  if (pinRaw) {
    if (!/^\d{4}$/.test(pinRaw)) {
      return NextResponse.json(
        { error: "PIN must be exactly 4 digits" },
        { status: 400 },
      );
    }
    pinCode = pinRaw;
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json(
      { error: "Username already exists" },
      { status: 409 },
    );
  }

  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      username,
      password: hashed,
      role,
      pinCode,
      status: "ACTIVE",
    },
    select: {
      id: true,
      username: true,
      role: true,
      status: true,
      createdAt: true,
    },
  });

  await logAuditAction(session.user.id, "CREATE", "USER", user.id, {
    username: user.username,
    role: user.role,
    hasPin: !!pinCode,
  });

  return NextResponse.json(
    {
      user: {
        ...user,
        hasPin: !!pinCode,
        createdAt: user.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
