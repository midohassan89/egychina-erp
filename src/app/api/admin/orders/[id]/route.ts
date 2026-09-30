import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isManagerOrAdmin } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";
import { pushCopyForOrderStatus, sendExpoPush } from "@/lib/push/expo";

const ORDER_STATUSES = [
  "قيد الانتظار",
  "جاري التجهيز",
  "مكتمل",
  "ملغي",
] as const;

/** PATCH /api/admin/orders/[id] — update a storefront order status. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isManagerOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Invalid order" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as { status?: unknown };
    const status = String(body.status ?? "");
    if (!ORDER_STATUSES.includes(status as (typeof ORDER_STATUSES)[number])) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const existing = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        phone: true,
        customerId: true,
        customer: { select: { expoPushToken: true, phone: true } },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const order = await prisma.order.update({
      where: { id },
      data: { status },
    });

    // Notify mobile app when status actually changes
    if (existing.status !== status) {
      const copy = pushCopyForOrderStatus(status, order.id);
      let token = existing.customer?.expoPushToken?.trim() ?? "";

      // Fallback: look up customer by order phone if not linked
      if (!token && order.phone) {
        const byPhone = await prisma.customer.findFirst({
          where: { phone: { contains: order.phone.replace(/\D/g, "").slice(-10) } },
          select: { expoPushToken: true },
        });
        token = byPhone?.expoPushToken?.trim() ?? "";
      }

      if (copy && token) {
        const result = await sendExpoPush({
          to: token,
          title: copy.title,
          body: copy.body,
          data: {
            type: "order_status",
            orderId: order.id,
            status,
          },
        });
        if (!result.ok) {
          console.error("[api/admin/orders/[id]] expo push", result.error);
        }
      }
    }

    return NextResponse.json(order);
  } catch (error) {
    console.error("[api/admin/orders/[id]]", error);
    return NextResponse.json(
      { error: "Could not update order" },
      { status: 500 },
    );
  }
}
