import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPin } from "@/lib/customers/pin";
import { serializeCustomerProfile } from "@/lib/customers/profile";
import {
  findCustomerAccount,
  normalizeCustomerPhone,
  verifyCustomerPassword,
} from "@/lib/customers/password";
import { requireStoreApiKey } from "@/lib/store/storeAuth";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
};

/** POST /api/customer/login — body: { phone, password, pin? } */
export async function POST(request: Request) {
  if (!requireStoreApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  let body: { phone?: unknown; password?: unknown; pin?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400, headers: corsHeaders });
  }

  const phone = normalizeCustomerPhone(body.phone);
  const password = typeof body.password === "string" ? body.password : "";
  const pin = String(body.pin ?? "").trim();
  if (!phone) {
    return NextResponse.json({ error: "phone is required" }, { status: 400, headers: corsHeaders });
  }

  const customer = await findCustomerAccount(prisma, phone);
  if (!customer) {
    return NextResponse.json(
      { error: "Incorrect phone or password" },
      { status: 401, headers: corsHeaders },
    );
  }
  if (!customer.password) {
    return NextResponse.json(
      { error: "Password is required", code: "PASSWORD_REQUIRED" },
      { status: 401, headers: corsHeaders },
    );
  }
  if (!password || !(await verifyCustomerPassword(password, customer.password))) {
    return NextResponse.json(
      { error: "Incorrect password" },
      { status: 401, headers: corsHeaders },
    );
  }

  if (pin && customer.pinHash && !verifyPin(pin, customer.pinHash)) {
    return NextResponse.json({ error: "Incorrect PIN" }, { status: 401, headers: corsHeaders });
  }

  const profile = await serializeCustomerProfile(prisma, customer.id);
  return NextResponse.json({ ok: true, customer: profile }, { headers: corsHeaders });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
