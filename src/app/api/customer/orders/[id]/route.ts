import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerOrder } from "@/lib/store/customerOrders";
import {
  requireStoreApiKey,
  resolveCustomerIdFromRequest,
  resolvePhoneFromRequest,
  resolveStoreCustomer,
} from "@/lib/store/storeAuth";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, x-api-key, x-customer-id, x-customer-phone, x-phone, Authorization",
};

/**
 * GET /api/customer/orders/[id]
 * Auth: x-api-key plus the customer Bearer token, customer id, or phone.
 */
export async function GET(
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
  const customerId = resolveCustomerIdFromRequest(request);
  const phone = resolvePhoneFromRequest(request);
  if (!id || (!customerId && !phone)) {
    return NextResponse.json(
      { error: "customerId or phone is required" },
      { status: 400, headers: corsHeaders },
    );
  }

  try {
    const customer = await resolveStoreCustomer(prisma, {
      customerId,
      phone,
      createIfMissing: false,
    });
    const order = await getCustomerOrder(id, customer?.id ?? "", phone);
    if (!order) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404, headers: corsHeaders },
      );
    }
    return NextResponse.json(
      { ok: true, order },
      { headers: { ...corsHeaders, "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[api/customer/orders/[id] GET]", error);
    return NextResponse.json(
      { error: "Could not load order" },
      { status: 500, headers: corsHeaders },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
