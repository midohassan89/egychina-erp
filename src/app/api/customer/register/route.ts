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

/** POST /api/customer/register — body: { phone, name, password } */
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
  const name = String(body.name ?? "").trim();
  const passwordError = customerPasswordError(body.password);
  if (!phone) {
    return NextResponse.json({ error: "phone is required" }, { status: 400, headers: corsHeaders });
  }
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400, headers: corsHeaders });
  }
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400, headers: corsHeaders });
  }

  const existing = await findCustomerAccount(prisma, phone);
  if (existing) {
    return NextResponse.json(
      { error: "Account already exists" },
      { status: 409, headers: corsHeaders },
    );
  }

  const password = await hashCustomerPassword(String(body.password));
  try {
    const created = await prisma.customer.create({
      data: { phone, name, password },
      select: { id: true },
    });
    const profile = await serializeCustomerProfile(prisma, created.id);
    return NextResponse.json({ ok: true, customer: profile }, { headers: corsHeaders });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "P2002") {
      return NextResponse.json(
        { error: "Account already exists" },
        { status: 409, headers: corsHeaders },
      );
    }
    console.error("[api/customer/register]", error);
    return NextResponse.json(
      { error: "Could not create account" },
      { status: 500, headers: corsHeaders },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
