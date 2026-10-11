import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStoreApiKey } from "@/lib/store/storeAuth";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key, x-customer-id",
};

type IncomingItem = { orderItemId?: unknown; quantity?: unknown };

/**
 * POST /api/returns
 * Storefront return request for specific order lines.
 * Body: { orderId, customerId, items: [{ orderItemId, quantity }] }
 */
export async function POST(request: Request) {
  if (!requireStoreApiKey(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders },
    );
  }

  let body: { orderId?: unknown; customerId?: unknown; items?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400, headers: corsHeaders },
    );
  }

  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  const customerId =
    typeof body.customerId === "string" ? body.customerId.trim() : "";
  if (!orderId || !customerId) {
    return NextResponse.json(
      { error: "orderId and customerId are required" },
      { status: 400, headers: corsHeaders },
    );
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json(
      { error: "At least one item is required" },
      { status: 400, headers: corsHeaders },
    );
  }

  const requested = new Map<string, number>();
  for (const raw of body.items as IncomingItem[]) {
    const orderItemId =
      typeof raw.orderItemId === "string" ? raw.orderItemId.trim() : "";
    const quantity = Number(raw.quantity);
    if (!orderItemId || !Number.isInteger(quantity) || quantity < 1) {
      return NextResponse.json(
        { error: "Each item needs an orderItemId and a quantity of at least 1" },
        { status: 400, headers: corsHeaders },
      );
    }
    requested.set(orderItemId, (requested.get(orderItemId) ?? 0) + quantity);
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      customerId: true,
      items: { select: { id: true, quantity: true } },
    },
  });
  if (!order) {
    return NextResponse.json(
      { error: "Order not found" },
      { status: 404, headers: corsHeaders },
    );
  }
  if (!order.customerId || order.customerId !== customerId) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: corsHeaders },
    );
  }

  const purchased = new Map(order.items.map((item) => [item.id, item.quantity]));
  for (const orderItemId of requested.keys()) {
    if (!purchased.has(orderItemId)) {
      return NextResponse.json(
        { error: "One or more items do not belong to this order" },
        { status: 400, headers: corsHeaders },
      );
    }
  }

  const alreadyReturning = await prisma.returnItem.findMany({
    where: {
      orderItemId: { in: [...requested.keys()] },
      returnRequest: { orderId, status: { not: "CANCELLED" } },
    },
    select: { orderItemId: true, quantity: true },
  });
  const reserved = new Map<string, number>();
  for (const row of alreadyReturning) {
    reserved.set(row.orderItemId, (reserved.get(row.orderItemId) ?? 0) + row.quantity);
  }

  for (const [orderItemId, quantity] of requested) {
    const allowed = purchased.get(orderItemId) ?? 0;
    if ((reserved.get(orderItemId) ?? 0) + quantity > allowed) {
      return NextResponse.json(
        { error: "Return quantity exceeds the purchased quantity" },
        { status: 400, headers: corsHeaders },
      );
    }
  }

  const created = await prisma.returnRequest.create({
    data: {
      orderId,
      customerId,
      items: {
        create: [...requested.entries()].map(([orderItemId, quantity]) => ({
          orderItemId,
          quantity,
        })),
      },
    },
    include: {
      items: { select: { id: true, orderItemId: true, quantity: true } },
    },
  });

  return NextResponse.json(created, { status: 201, headers: corsHeaders });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
