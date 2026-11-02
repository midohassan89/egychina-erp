import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canUsePos } from "@/lib/auth/roles";
import { serializeQueueTicket } from "@/lib/pos/queueTicket";

/**
 * GET /api/pos/queue-tickets — PENDING + CLAIMED tickets for main cashier.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !canUsePos(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tickets = await prisma.posQueueTicket.findMany({
      where: { status: { in: ["PENDING", "CLAIMED"] } },
      orderBy: [{ createdAt: "asc" }],
      take: 100,
    });

    return NextResponse.json({
      ok: true,
      tickets: tickets.map(serializeQueueTicket),
      count: tickets.length,
    });
  } catch (error) {
    console.error("[api/pos/queue-tickets GET]", error);
    return NextResponse.json(
      {
        ok: false,
        error: "تعذر تحميل قسائم الانتظار",
        message: "تعذر تحميل قسائم الانتظار",
      },
      { status: 500 },
    );
  }
}
