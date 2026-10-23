import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeCustomerProfile } from "@/lib/customers/profile";
import {
  customerPasswordError,
  findCustomerAccount,
  hashCustomerPassword,
  normalizeCustomerPhone,
} from "@/lib/customers/password";
import { requireStoreApiKey } from "@/lib/store/storeAuth";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
};

/**
 * POST /api/customer/set-password
 * Completes a cashier-created account that has no password yet.
 * Body: { phone, password, name? }
 */
export async function POST(request: Request) {
  if (!requireStoreApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  let body: { phone?: unknown; name?: unknown; password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400, headers: corsHeaders });
  }

  const phone = normalizeCustomerPhone(body.phone);
  const incomingName = String(body.name ?? "").trim();
  const passwordError = customerPasswordError(body.password);
  if (!phone) {
    return NextResponse.json({ error: "phone is required" }, { status: 400, headers: corsHeaders });
  }
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400, headers: corsHeaders });
  }

  const customer = await findCustomerAccount(prisma, phone);
  if (!customer) {
    return NextResponse.json({ error: "Account not found" }, { status: 404, headers: corsHeaders });
  }
  if (customer.password) {
    return NextResponse.json(
      { error: "Password already set" },
      { status: 409, headers: corsHeaders },
    );
  }

  const hasName = Boolean(customer.name?.trim());
  if (!hasName && !incomingName) {
    return NextResponse.json({ error: "name is required" }, { status: 400, headers: corsHeaders });
  }

  const password = await hashCustomerPassword(String(body.password));
  await prisma.customer.update({
    where: { id: customer.id },
    data: {
      password,
      ...(!hasName ? { name: incomingName } : {}),
    },
  });

  const profile = await serializeCustomerProfile(prisma, customer.id);
  return NextResponse.json({ ok: true, customer: profile }, { headers: corsHeaders });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
