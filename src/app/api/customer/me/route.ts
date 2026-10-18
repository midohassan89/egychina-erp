import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyCustomerPin, serializeCustomerProfile } from "@/lib/customers/profile";
import {
  requireStoreApiKey,
  resolveCustomerIdFromRequest,
  resolvePhoneFromRequest,
  resolveStoreCustomer,
} from "@/lib/store/storeAuth";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, x-api-key, x-customer-id, x-customer-phone, x-phone, Authorization",
};

async function currentCustomer(request: Request, body?: { customerId?: unknown; phone?: unknown }) {
  const customerId = resolveCustomerIdFromRequest(request, body?.customerId);
  const phone = resolvePhoneFromRequest(request, body?.phone);
  if (!customerId && !phone) return null;
  return resolveStoreCustomer(prisma, { customerId, phone, createIfMissing: false });
}

export async function GET(request: Request) {
  if (!requireStoreApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }
  const customer = await currentCustomer(request);
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404, headers: corsHeaders });
  }
  const profile = await serializeCustomerProfile(prisma, customer.id);
  return NextResponse.json({ ok: true, customer: profile }, { headers: corsHeaders });
}

/** PATCH /api/customer/me — body: { name?, pin? } */
export async function PATCH(request: Request) {
  if (!requireStoreApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }
  let body: { name?: unknown; pin?: unknown; customerId?: unknown; phone?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const customer = await currentCustomer(request, body);
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404, headers: corsHeaders });
  }

  const name = body.name !== undefined ? String(body.name ?? "").trim() : undefined;
  if (name !== undefined && !name) {
    return NextResponse.json({ error: "name cannot be empty" }, { status: 400, headers: corsHeaders });
  }
  if (name) {
    await prisma.customer.update({ where: { id: customer.id }, data: { name } });
  }
  const pin = String(body.pin ?? "").trim();
  if (pin) {
    const result = await applyCustomerPin(prisma, customer.id, pin, null, "set");
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status, headers: corsHeaders });
    }
  }

  const profile = await serializeCustomerProfile(prisma, customer.id);
  return NextResponse.json({ ok: true, customer: profile }, { headers: corsHeaders });
}

/** DELETE /api/customer/me — disable the account and free the phone number. */
export async function DELETE(request: Request) {
  if (!requireStoreApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }
  const customer = await currentCustomer(request);
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404, headers: corsHeaders });
  }

  await prisma.$transaction([
    prisma.wishlistItem.deleteMany({ where: { customerId: customer.id } }),
    prisma.customerAddress.deleteMany({ where: { customerId: customer.id } }),
    prisma.customer.update({
      where: { id: customer.id },
      data: {
        deletedAt: new Date(),
        name: null,
        pinHash: null,
        expoPushToken: null,
        pushToken: null,
        password: null,
        phone: `deleted-${customer.id}`,
      },
    }),
  ]);

  return NextResponse.json({ ok: true }, { headers: corsHeaders });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
