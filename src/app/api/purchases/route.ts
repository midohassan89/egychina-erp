import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

/** GET /api/purchases — recent purchase invoices */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invoices = await prisma.purchaseInvoice.findMany({
    orderBy: { date: "desc" },
    take: 100,
    include: {
      supplier: { select: { id: true, name: true } },
      _count: { select: { items: true } },
    },
  });

  return NextResponse.json({
    invoices: invoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      date: inv.date.toISOString(),
      supplierId: inv.supplierId,
      supplierName: inv.supplier.name,
      totalAmount: inv.totalAmount,
      paidAmount: inv.paidAmount,
      status: inv.status,
      dueAmount:
        Math.round((inv.totalAmount - inv.paidAmount) * 100) / 100,
      itemCount: inv._count.items,
      createdAt: inv.createdAt.toISOString(),
    })),
  });
}
