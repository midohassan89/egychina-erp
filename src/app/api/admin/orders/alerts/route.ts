import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isManagerOrAdmin } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";

/** GET /api/admin/orders/alerts — pending storefront order ids for the sidebar badge. */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isManagerOrAdmin(session.user.role)) {
    return NextResponse.json({ count: 0, ids: [] });
  }

  const pending = await prisma.order.findMany({
    where: { status: "PENDING" },
    select: { id: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    count: pending.length,
    ids: pending.map((order) => order.id),
  });
}
