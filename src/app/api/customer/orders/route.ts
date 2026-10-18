import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listCustomerOrders } from "@/lib/store/customerOrders";
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
 * GET /api/customer/orders
 * Auth: x-api-key plus the customer Bearer token, customer id, or phone.
 */
export async function GET(request: Request) {
  if (!requireStoreApiKey(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders },
    );
  }

  const customerId = resolveCustomerIdFromRequest(request);
  const phone = resolvePhoneFromRequest(request);
  if (!customerId && !phone) {
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
    const orders = await listCustomerOrders(customer?.id ?? "", phone);
    return NextResponse.json(
      { ok: true, orders, customerId: customer?.id ?? null },
      { headers: { ...corsHeaders, "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[api/customer/orders GET]", error);
    return NextResponse.json(
      { error: "Could not load orders" },
      { status: 500, headers: corsHeaders },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
