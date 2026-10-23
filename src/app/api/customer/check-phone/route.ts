import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  customerAccountState,
  findCustomerAccount,
  normalizeCustomerPhone,
} from "@/lib/customers/password";
import { requireStoreApiKey } from "@/lib/store/storeAuth";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
};

/** POST /api/customer/check-phone — body: { phone } */
export async function POST(request: Request) {
  if (!requireStoreApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  let body: { phone?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400, headers: corsHeaders });
  }

  const phone = normalizeCustomerPhone(body.phone);
  if (!phone) {
    return NextResponse.json({ error: "phone is required" }, { status: 400, headers: corsHeaders });
  }

  const customer = await findCustomerAccount(prisma, phone);
  const state = customerAccountState(customer);
  return NextResponse.json(
    {
      exists: state.exists,
      hasPassword: state.hasPassword,
      hasName: state.hasName,
      name: state.name,
      hasPin: Boolean(customer?.pinHash),
    },
    { headers: corsHeaders },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
