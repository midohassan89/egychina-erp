import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canUsePos } from "@/lib/auth/roles";
import { resolvePosAccess } from "@/lib/pos/deviceAuth";
import { serializeQueueTicket } from "@/lib/pos/queueTicket";

/**
 * GET /api/pos/queue-tickets — PENDING + CLAIMED tickets for main cashier.
 * Auth: staff session or enrolled desktop device Bearer (same as /api/checkout).
 */
export async function GET(request: Request) {
  const access = await resolvePosAccess(request);
  if (!access?.userId || !canUsePos(access.role)) {
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
