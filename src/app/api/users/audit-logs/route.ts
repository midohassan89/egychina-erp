import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth/roles";

/**
 * GET /api/users/audit-logs — Admin-only activity log (newest first).
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const take = Math.min(Number(searchParams.get("limit") ?? 200) || 200, 500);
  const username = searchParams.get("username")?.trim();
  const entity = searchParams.get("entity")?.trim();
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const logs = await prisma.auditLog.findMany({
    where: {
      ...(entity ? { entity } : {}),
      ...(username ? { user: { username: { contains: username } } } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(`${from}T00:00:00`) } : {}),
              ...(to ? { lte: new Date(`${to}T23:59:59`) } : {}),
            },
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      user: { select: { id: true, username: true, role: true } },
    },
  });

  return NextResponse.json({
    logs: logs.map((log) => ({
      id: log.id,
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      details: log.details,
      createdAt: log.createdAt.toISOString(),
      user: {
        id: log.user.id,
        username: log.user.username,
        role: log.user.role,
      },
    })),
  });
}
