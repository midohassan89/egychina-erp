import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canUsePos } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** GET /api/pos/online-orders — recent storefront orders for the cashier desk. */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canUsePos(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [orders, drivers] = await Promise.all([
    prisma.order.findMany({
      where: { status: { notIn: ["CANCELLED", "RETURNED"] } },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: {
        assignedDriver: { select: { id: true, username: true } },
        items: {
          include: { product: { select: { name: true } } },
        },
      },
    }),
    prisma.user.findMany({
      where: { role: "DRIVER", status: "ACTIVE" },
      select: { id: true, username: true },
      orderBy: { username: "asc" },
    }),
  ]);

  return NextResponse.json({
    orders: orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber || `#${order.id.slice(-6).toUpperCase()}`,
      customerName: order.customerName,
      phone: order.phone,
      address: order.address,
      notes: order.notes,
      totalAmount: order.totalAmount,
      status: order.status,
      createdAt: order.createdAt.toISOString(),
      assignedDriverId: order.assignedDriverId,
      assignedDriverName: order.assignedDriver?.username ?? null,
      items: order.items.map((item) => ({
        id: item.id,
        name: item.product.name,
        quantity: item.quantity,
        price: item.price,
      })),
    })),
    drivers,
  });
}
