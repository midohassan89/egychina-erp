import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canManageUsers } from "@/lib/auth/roles";
import { logAuditAction } from "@/lib/audit/logAuditAction";

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
