import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ALL_ROLES, canManageUsers } from "@/lib/auth/roles";
import { logAuditAction } from "@/lib/audit/logAuditAction";
import type { AppRole } from "@/auth.config";

const FK_MESSAGE =
  "Cannot delete user with existing records. Please suspend them instead.";

function isFkConstraintError(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2003" || error.code === "P2014")
  ) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /foreign key|FOREIGN KEY|constraint failed/i.test(message);
}

/**
 * PATCH /api/users/[id]
 * Update username, role, optional password, and/or PIN for an existing staff account.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const existing = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      role: true,
      pinCode: true,
      status: true,
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
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

  const data: {
    username?: string;
    password?: string;
    role?: AppRole;
    pinCode?: string | null;
  } = {};

  if (typeof body.username === "string") {
    const username = body.username.trim();
    if (username.length < 2) {
      return NextResponse.json(
        { error: "Username must be at least 2 characters" },
        { status: 400 },
      );
    }
    if (username !== existing.username) {
      const clash = await prisma.user.findUnique({ where: { username } });
      if (clash) {
        return NextResponse.json(
          { error: "Username already exists" },
          { status: 409 },
        );
      }
      data.username = username;
    }
  }

  if (typeof body.password === "string" && body.password.length > 0) {
    if (body.password.length < 4) {
      return NextResponse.json(
        { error: "Password must be at least 4 characters" },
        { status: 400 },
      );
    }
    data.password = await bcrypt.hash(body.password, 12);
  }

  if (typeof body.role === "string") {
    if (!(ALL_ROLES as readonly string[]).includes(body.role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    data.role = body.role as AppRole;
  }

  const nextRole = (data.role ?? existing.role) as AppRole;
  if (body.pinCode !== undefined) {
    if (body.pinCode === null || body.pinCode === "") {
      if (nextRole === "CASHIER") {
        return NextResponse.json(
          { error: "Cashier accounts require a 4-digit PIN" },
          { status: 400 },
        );
      }
      data.pinCode = null;
    } else {
      const pinRaw = String(body.pinCode).trim();
      if (!/^\d{4}$/.test(pinRaw)) {
        return NextResponse.json(
          { error: "PIN must be exactly 4 digits" },
          { status: 400 },
        );
      }
      data.pinCode = pinRaw;
    }
  } else if (nextRole === "CASHIER" && !existing.pinCode) {
    return NextResponse.json(
      { error: "Cashier accounts require a 4-digit PIN" },
      { status: 400 },
    );
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No changes" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      username: true,
      role: true,
      status: true,
      pinCode: true,
      updatedAt: true,
    },
  });

  await logAuditAction(session.user.id, "UPDATE", "USER", user.id, {
    username: user.username,
    role: user.role,
    hasPin: !!user.pinCode,
    fields: Object.keys(data),
  });

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
      hasPin: !!user.pinCode,
      updatedAt: user.updatedAt.toISOString(),
    },
  });
}

/**
 * DELETE /api/users/[id]
 * Hard delete — returns 400 if foreign-key constraints block removal.
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;

  if (id === session.user.id) {
    return NextResponse.json(
      { error: "You cannot delete your own account" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  try {
    await prisma.user.delete({ where: { id } });
  } catch (error) {
    if (isFkConstraintError(error)) {
      return NextResponse.json({ error: FK_MESSAGE }, { status: 400 });
    }
    console.error("[api/users/[id]] delete", error);
    return NextResponse.json({ error: FK_MESSAGE }, { status: 400 });
  }

  await logAuditAction(session.user.id, "DELETE", "USER", id, {
    username: user.username,
  });

  return NextResponse.json({ ok: true });
}
