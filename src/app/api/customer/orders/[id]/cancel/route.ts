import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyOrderStatusLoyalty } from "@/lib/orders/loyalty";
import {
  CUSTOMER_CANCELLABLE,
  normalizeOrderStatus,
} from "@/lib/orders/status";
import { normalizeLoyaltyPhone } from "@/lib/pos/loyaltyScan";
import {
  requireStoreApiKey,
  resolveCustomerIdFromRequest,
  resolvePhoneFromRequest,
  resolveStoreCustomer,
} from "@/lib/store/storeAuth";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, x-api-key, x-customer-id, x-customer-phone, x-phone, Authorization",
};

const CANCEL_BLOCKED = {
  error: "لا يمكن إلغاء الطلب في هذه المرحلة",
  errorEn: "Cannot cancel order at this stage",
};

/**
 * POST /api/customer/orders/[id]/cancel
 * Cancels a PENDING or CONFIRMED order and refunds redeemed points.
 */
export async function POST(
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

  let body: { customerId?: unknown; phone?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const customerId = resolveCustomerIdFromRequest(request, body.customerId);
  const phoneRaw = resolvePhoneFromRequest(request, body.phone);
  if (!customerId && !phoneRaw) {
    return NextResponse.json(
      { error: "customerId or phone is required" },
      { status: 400, headers: corsHeaders },
    );
  }

  const customer = await resolveStoreCustomer(prisma, {
    customerId,
    phone: phoneRaw,
    createIfMissing: false,
  });
  const phone = phoneRaw ? normalizeLoyaltyPhone(phoneRaw) || phoneRaw : "";

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
    (customer && order.customerId === customer.id) ||
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
