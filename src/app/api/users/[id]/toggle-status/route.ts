import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canManageUsers } from "@/lib/auth/roles";
import { logAuditAction } from "@/lib/audit/logAuditAction";

/**
 * PATCH /api/users/[id]/toggle-status
 * Switch a user between ACTIVE and SUSPENDED.
 */
export async function PATCH(
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
      { error: "You cannot suspend your own account" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const nextStatus = user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";

  const updated = await prisma.user.update({
    where: { id },
    data: { status: nextStatus },
    select: {
      id: true,
      username: true,
      role: true,
      status: true,
    },
  });

  await logAuditAction(session.user.id, "UPDATE", "USER", id, {
    username: updated.username,
    status: nextStatus,
    previousStatus: user.status,
  });

  return NextResponse.json({ ok: true, user: updated });
}
