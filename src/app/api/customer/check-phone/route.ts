import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeLoyaltyPhone } from "@/lib/pos/loyaltyScan";
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

  const raw = String(body.phone ?? "").trim();
  const phone = normalizeLoyaltyPhone(raw) || raw;
  if (!phone) {
    return NextResponse.json({ error: "phone is required" }, { status: 400, headers: corsHeaders });
  }

  const customer = await prisma.customer.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { phone },
        { phone: raw },
        ...(phone.length >= 10 ? [{ phone: { contains: phone.slice(-10) } }] : []),
      ],
    },
    select: { name: true, pinHash: true },
  });

  const name = customer?.name?.trim() || null;
  return NextResponse.json(
    {
      exists: Boolean(customer),
      hasName: Boolean(name),
      name,
      hasPin: Boolean(customer?.pinHash),
    },
    { headers: corsHeaders },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
