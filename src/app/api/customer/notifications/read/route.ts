import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireStoreApiKey,
  resolveCustomerIdFromRequest,
  resolvePhoneFromRequest,
  resolveStoreCustomer,
} from "@/lib/store/storeAuth";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "PATCH, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, x-api-key, x-customer-id, x-customer-phone, x-phone, Authorization",
};

/** PATCH /api/customer/notifications/read — body: { ids?: string[] } marks those, or all. */
export async function PATCH(request: Request) {
  if (!requireStoreApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }
  let body: { ids?: unknown; customerId?: unknown; phone?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const customer = await resolveStoreCustomer(prisma, {
    customerId: resolveCustomerIdFromRequest(request, body.customerId),
    phone: resolvePhoneFromRequest(request, body.phone),
    createIfMissing: false,
  });
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404, headers: corsHeaders });
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.map((id) => String(id).trim()).filter(Boolean)
    : [];
  const result = await prisma.customerNotification.updateMany({
    where: {
      customerId: customer.id,
      isRead: false,
      ...(ids.length ? { id: { in: ids } } : {}),
    },
    data: { isRead: true },
  });
  return NextResponse.json({ ok: true, updated: result.count }, { headers: corsHeaders });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
