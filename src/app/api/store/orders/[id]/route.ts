import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeLoyaltyPhone } from "@/lib/pos/loyaltyScan";
import {
  CUSTOMER_CANCELLABLE,
  normalizeOrderStatus,
} from "@/lib/orders/status";
import { applyOrderStatusLoyalty } from "@/lib/orders/loyalty";
import { requireStoreApiKey } from "@/lib/store/storeAuth";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
};

const CANCEL_BLOCKED = {
  error: "لا يمكن إلغاء الطلب في هذه المرحلة",
  errorEn: "Cannot cancel order at this stage",
};

/**
 * PATCH /api/store/orders/[id]
 * Customer cancellation. Only PENDING or CONFIRMED orders can become CANCELLED.
 * Body: { status: "CANCELLED", customerId? , phone? }
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!requireStoreApiKey(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders },
    );
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { error: "Invalid order" },
      { status: 400, headers: corsHeaders },
    );
  }

  let body: { status?: unknown; customerId?: unknown; phone?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400, headers: corsHeaders },
    );
  }

  const requested = normalizeOrderStatus(String(body.status ?? ""));
  if (requested !== "CANCELLED") {
    return NextResponse.json(
      { error: "Customers can only set status to CANCELLED" },
      { status: 400, headers: corsHeaders },
    );
  }

  const customerId =
    typeof body.customerId === "string" ? body.customerId.trim() : "";
  const phoneRaw = typeof body.phone === "string" ? body.phone.trim() : "";
  const phone = phoneRaw ? normalizeLoyaltyPhone(phoneRaw) || phoneRaw : "";
  if (!customerId && !phone) {
    return NextResponse.json(
      { error: "customerId or phone is required" },
      { status: 400, headers: corsHeaders },
    );
  }

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      customerId: true,
      phone: true,
      pointsEarned: true,
      pointsAwarded: true,
    },
  });
  if (!order) {
    return NextResponse.json(
      { error: "Order not found" },
      { status: 404, headers: corsHeaders },
    );
  }

  const orderPhone = normalizeLoyaltyPhone(order.phone) || order.phone;
  const ownsOrder =
    (customerId && order.customerId === customerId) ||
    (phone &&
      (order.phone === phoneRaw ||
        order.phone === phone ||
        orderPhone === phone ||
        orderPhone.endsWith(phone.slice(-10))));
  if (!ownsOrder) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: corsHeaders },
    );
  }

  const current = normalizeOrderStatus(order.status);
  if (!current || !CUSTOMER_CANCELLABLE.has(current)) {
    return NextResponse.json(CANCEL_BLOCKED, {
      status: 400,
      headers: corsHeaders,
    });
  }

  const updated = await prisma.$transaction((tx) =>
    applyOrderStatusLoyalty(tx, order, "CANCELLED"),
  );

  return NextResponse.json(
    { ok: true, id: updated.id, status: updated.status },
    { headers: corsHeaders },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
