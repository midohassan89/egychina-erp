import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isManagerOrAdmin } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/fleet/expenses?status=PENDING
 * List driver expenses for admin review.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isManagerOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status =
    new URL(request.url).searchParams.get("status")?.trim().toUpperCase() ?? "";

  const expenses = await prisma.driverExpense.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      driver: { select: { id: true, username: true } },
    },
  });

  return NextResponse.json({
    expenses: expenses.map((e) => ({
      id: e.id,
      driverId: e.driverId,
      driverName: e.driver.username,
      category: e.category,
      amount: e.amount,
      approvedAmount: e.approvedAmount,
      status: e.status,
      adminNotes: e.adminNotes,
      odometerImage: e.odometerImage,
      pumpImage: e.pumpImage,
      receiptImage: e.receiptImage,
      tollImage: e.tollImage,
      linkedExpenseId: e.linkedExpenseId,
      createdAt: e.createdAt.toISOString(),
      reviewedAt: e.reviewedAt?.toISOString() ?? null,
    })),
  });
}
