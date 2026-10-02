import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isManagerOrAdmin } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";
import { sendExpoPush } from "@/lib/push/expo";

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
    const newStatus = String(body.status ?? "");
    console.log("ADMIN STATUS UPDATE:", { orderId: id, newStatus });
    if (!ORDER_STATUSES.includes(newStatus as (typeof ORDER_STATUSES)[number])) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const existing = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        phone: true,
        customerId: true,
        customer: { select: { expoPushToken: true } },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const order = await prisma.order.update({
      where: { id },
      data: { status: newStatus },
    });

    if (existing.status !== newStatus) {
      let token = existing.customer?.expoPushToken?.trim() ?? "";

      if (!token && order.phone) {
        const digits = order.phone.replace(/\D/g, "");
        const byPhone = await prisma.customer.findFirst({
          where: {
            OR: [
              { phone: order.phone },
              ...(digits
                ? [{ phone: { contains: digits.slice(-10) } }]
                : []),
            ],
          },
          select: { expoPushToken: true },
        });
        token = byPhone?.expoPushToken?.trim() ?? "";
      }

      if (token) {
        const result = await sendExpoPush({
          to: token,
          title: "تحديث حالة الطلب",
          body: `طلبك رقم #${order.id} أصبح الآن: ${newStatus}`,
          data: {
            type: "order_status",
            orderId: order.id,
            status: newStatus,
          },
        });
        if (!result.ok) {
          console.error("[api/admin/orders/[id]] expo push", result.error);
        }
      } else {
        console.warn(
          "[api/admin/orders/[id]] no expoPushToken for order",
          order.id,
        );
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

/** Alias — some clients use PUT instead of PATCH. */
export const PUT = PATCH;
