import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { roundMoney } from "@/lib/pos/money";
import { adjustmentTypeLabel } from "@/lib/inventory/adjustmentTypes";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

/** GET /api/inventory/adjustments — list past adjustments */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await prisma.inventoryAdjustment.findMany({
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: 100,
    include: {
      items: true,
      user: { select: { username: true } },
    },
  });

  return NextResponse.json({
    adjustments: rows.map((row) => {
      const financialImpact = roundMoney(
        row.items.reduce(
          (sum, item) => sum + item.quantityChange * item.unitCost,
          0,
        ),
      );
      return {
        id: row.id,
        date: row.date.toISOString(),
        type: row.type,
        typeLabel: adjustmentTypeLabel(row.type),
        notes: row.notes,
        userName: row.user.username,
        itemCount: row.items.length,
        financialImpact,
      };
    }),
  });
}
