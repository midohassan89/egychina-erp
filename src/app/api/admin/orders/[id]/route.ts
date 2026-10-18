import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isManagerOrAdmin } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";
import { orderStatusNotification } from "@/lib/notifications/orderStatusCopy";
import { pushToCustomer } from "@/lib/notifications/pushCustomer";
import { normalizeOrderStatus } from "@/lib/orders/status";
import { applyOrderStatusLoyalty } from "@/lib/orders/loyalty";

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
    const newStatus = normalizeOrderStatus(String(body.status ?? ""));
    console.log("ADMIN STATUS UPDATE:", { orderId: id, newStatus });
    if (!newStatus) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    if (newStatus === "PARTIALLY_RETURNED" || newStatus === "RETURNED") {
      return NextResponse.json(
        { error: "حالة المرتجع تُحدَّد تلقائياً عند اكتمال طلب الإرجاع" },
        { status: 400 },
      );
    }

    const existing = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        phone: true,
        customerId: true,
        pointsEarned: true,
        pointsAwarded: true,
        customer: { select: { expoPushToken: true, pushToken: true } },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const order = await prisma.$transaction((tx) =>
      applyOrderStatusLoyalty(tx, existing, newStatus),
    );

    if (existing.status !== newStatus) {
      // Prefer linked customer, then look up by order phone
      let customer = existing.customerId
        ? await prisma.customer.findUnique({
            where: { id: existing.customerId },
            select: { id: true, expoPushToken: true, pushToken: true, phone: true },
          })
        : null;

      if (!customer?.expoPushToken && order.phone) {
        const digits = order.phone.replace(/\D/g, "");
        customer = await prisma.customer.findFirst({
          where: {
            OR: [
              { phone: order.phone },
              ...(digits ? [{ phone: { contains: digits.slice(-10) } }] : []),
            ],
          },
          select: { id: true, expoPushToken: true, pushToken: true, phone: true },
        });
      }

      const number = existing.orderNumber || order.id.slice(0, 8).toUpperCase();
      const copy = orderStatusNotification(newStatus, number);
      if (customer) {
        await prisma.customerNotification.create({
          data: {
            customerId: customer.id,
            ...copy,
            type: "ORDER",
            orderId: order.id,
          },
        });
        await pushToCustomer(customer, copy.titleAr, copy.bodyAr, {
          type: "order_status",
          orderId: order.id,
          orderNumber: number,
          status: newStatus,
        });
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
