import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isManagerOrAdmin } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";
import { getLoyaltySettings } from "@/lib/loyalty/settings";
import { orderStatusNotification } from "@/lib/notifications/orderStatusCopy";
import { pushToCustomer } from "@/lib/notifications/pushCustomer";

const RETURN_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "COLLECTING",
  "COMPLETED",
  "CANCELLED",
] as const;

type ReturnStatusCode = (typeof RETURN_STATUSES)[number];

function isReturnStatus(value: string): value is ReturnStatusCode {
  return (RETURN_STATUSES as readonly string[]).includes(value);
}

/**
 * PATCH /api/returns/[id]
 * Admin updates a return request. Completing it deducts loyalty points once
 * and marks the order partially or fully returned.
 */
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
    return NextResponse.json({ error: "Invalid return" }, { status: 400 });
  }

  let body: { status?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const nextStatus = String(body.status ?? "").trim();
  if (!isReturnStatus(nextStatus)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const existing = await prisma.returnRequest.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Return not found" }, { status: 404 });
  }

  const loyalty = await getLoyaltySettings();

  let restocked = false;
  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.returnRequest.findUnique({
      where: { id },
      include: {
        items: {
          select: {
            orderItemId: true,
            quantity: true,
            orderItem: { select: { price: true, productId: true } },
          },
        },
      },
    });
    if (!current) return null;

    if (nextStatus !== "COMPLETED" || current.pointsDeducted) {
      return tx.returnRequest.update({
        where: { id },
        data: { status: nextStatus },
        include: {
          items: { select: { id: true, orderItemId: true, quantity: true } },
        },
      });
    }

    restocked = true;
    for (const item of current.items) {
      const product = await tx.product.update({
        where: { id: item.orderItem.productId },
        data: { stockQuantity: { increment: item.quantity } },
        select: { stockQuantity: true },
      });
      await tx.product.update({
        where: { id: item.orderItem.productId },
        data: {
          stockStatus: product.stockQuantity > 0 ? "instock" : "outofstock",
        },
      });
    }

    if (session.user.id) {
      await tx.inventoryAdjustment.create({
        data: {
          type: "CUSTOMER_RETURN",
          notes: `مرتجع عميل ${current.id}`,
          userId: session.user.id,
          items: {
            create: current.items.map((item) => ({
              productId: item.orderItem.productId,
              quantityChange: Math.max(1, Math.round(item.quantity)),
              unitCost: 0,
            })),
          },
        },
      });
    }

    const returnedValue = current.items.reduce(
      (sum, item) => sum + item.orderItem.price * item.quantity,
      0,
    );
    const points = Math.max(
      0,
      Math.floor(returnedValue * loyalty.pointsEarnRatio),
    );

    if (points > 0) {
      const customer = await tx.customer.findUnique({
        where: { id: current.customerId },
        select: { pointsBalance: true },
      });
      const deducted = Math.min(customer?.pointsBalance ?? 0, points);
      if (deducted > 0) {
        await tx.customer.update({
          where: { id: current.customerId },
          data: { pointsBalance: { decrement: deducted } },
        });
        await tx.pointsTransaction.create({
          data: {
            customerId: current.customerId,
            points: -deducted,
            type: "EARN",
            description: `Return ${current.id}`,
          },
        });
      }
    }

    const orderItems = await tx.orderItem.findMany({
      where: { orderId: current.orderId },
      select: { id: true, quantity: true },
    });
    const prior = await tx.returnItem.findMany({
      where: {
        returnRequest: {
          orderId: current.orderId,
          status: "COMPLETED",
          id: { not: current.id },
        },
      },
      select: { orderItemId: true, quantity: true },
    });
    const returnedQty = new Map<string, number>();
    for (const row of prior) {
      returnedQty.set(
        row.orderItemId,
        (returnedQty.get(row.orderItemId) ?? 0) + row.quantity,
      );
    }
    for (const item of current.items) {
      returnedQty.set(
        item.orderItemId,
        (returnedQty.get(item.orderItemId) ?? 0) + item.quantity,
      );
    }
    const allReturned =
      orderItems.length > 0 &&
      orderItems.every(
        (item) => (returnedQty.get(item.id) ?? 0) + 0.0005 >= item.quantity,
      );

    await tx.order.update({
      where: { id: current.orderId },
      data: { status: allReturned ? "RETURNED" : "PARTIALLY_RETURNED" },
    });

    return tx.returnRequest.update({
      where: { id },
      data: { status: "COMPLETED", pointsDeducted: true },
      include: {
        items: { select: { id: true, orderItemId: true, quantity: true } },
      },
    });
  });

  if (!updated) {
    return NextResponse.json({ error: "Return not found" }, { status: 404 });
  }

  if (restocked && updated.pointsDeducted) {
    const row = await prisma.returnRequest.findUnique({
      where: { id },
      select: {
        customer: { select: { id: true, expoPushToken: true, pushToken: true } },
        order: { select: { id: true, orderNumber: true } },
      },
    });
    if (row?.customer) {
      const number = row.order.orderNumber || `#${row.order.id.slice(-6).toUpperCase()}`;
      const copy = orderStatusNotification("RETURNED", number);
      copy.bodyAr = `تم استلام مرتجع الطلب ${number} وإعادة الكمية للمخزون`;
      await prisma.customerNotification.create({
        data: {
          customerId: row.customer.id,
          ...copy,
          type: "ORDER",
          orderId: row.order.id,
        },
      });
      await pushToCustomer(row.customer, copy.titleAr, copy.bodyAr, {
        type: "return_received",
        orderId: row.order.id,
      });
    }
  }

  return NextResponse.json(updated);
}
