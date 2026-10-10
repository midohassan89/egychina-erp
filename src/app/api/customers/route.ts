import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isManagerOrAdmin } from "@/lib/auth/roles";

/** GET /api/customers — loyalty customers for the dashboard. */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isManagerOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const customers = await prisma.customer.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      phone: true,
      pointsBalance: true,
      createdAt: true,
      _count: { select: { orders: true } },
    },
  });

  return NextResponse.json({
    customers: customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      pointsBalance: customer.pointsBalance,
      ordersCount: customer._count.orders,
      createdAt: customer.createdAt.toISOString(),
    })),
  });
}
