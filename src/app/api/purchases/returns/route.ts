import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

/** GET /api/purchases/returns — purchase return history */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const returns = await prisma.purchaseReturn.findMany({
    orderBy: { date: "desc" },
    take: 100,
    include: {
      supplier: { select: { id: true, name: true } },
      _count: { select: { items: true } },
    },
  });

  return NextResponse.json({
    returns: returns.map((row) => ({
      id: row.id,
      date: row.date.toISOString(),
      supplierId: row.supplierId,
      supplierName: row.supplier.name,
      totalAmount: row.totalAmount,
      notes: row.notes,
      itemCount: row._count.items,
      createdAt: row.createdAt.toISOString(),
    })),
  });
}
