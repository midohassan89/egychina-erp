import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyCustomerPin, serializeCustomerProfile } from "@/lib/customers/profile";
import { normalizeLoyaltyPhone } from "@/lib/pos/loyaltyScan";
import { requireStoreApiKey, resolveStoreCustomer } from "@/lib/store/storeAuth";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
};

/** POST /api/customer/login — body: { phone, name?, pin? } */
export async function POST(request: Request) {
  if (!requireStoreApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  let body: { phone?: unknown; name?: unknown; pin?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400, headers: corsHeaders });
  }

  const raw = String(body.phone ?? "").trim();
  const phone = normalizeLoyaltyPhone(raw) || raw;
  const name = String(body.name ?? "").trim();
  const pin = String(body.pin ?? "").trim();
  if (!phone) {
    return NextResponse.json({ error: "phone is required" }, { status: 400, headers: corsHeaders });
  }

  const customer = await resolveStoreCustomer(prisma, {
    phone,
    name: name || null,
    createIfMissing: true,
  });
  if (!customer) {
    return NextResponse.json({ error: "Could not sign in" }, { status: 400, headers: corsHeaders });
  }

  if (pin) {
    const row = await prisma.customer.findUnique({
      where: { id: customer.id },
      select: { pinHash: true },
    });
    const result = await applyCustomerPin(
      prisma,
      customer.id,
      pin,
      row?.pinHash ?? null,
      "verify-or-set",
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status, headers: corsHeaders });
    }
  }

  const profile = await serializeCustomerProfile(prisma, customer.id);
  return NextResponse.json({ ok: true, customer: profile }, { headers: corsHeaders });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
