import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { quoteCoupon } from "@/lib/coupons/quote";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
};

/** POST /api/coupons/validate — body: { code, subtotal } */
export async function POST(request: Request) {
  let body: { code?: unknown; subtotal?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { valid: false, error: "Invalid request body" },
      { status: 400, headers: corsHeaders },
    );
  }

  const code = String(body.code ?? "").trim().toUpperCase();
  const subtotal = Number(body.subtotal);
  if (!code) {
    return NextResponse.json(
      { valid: false, error: "code is required" },
      { status: 400, headers: corsHeaders },
    );
  }
  if (!Number.isFinite(subtotal) || subtotal < 0) {
    return NextResponse.json(
      { valid: false, error: "subtotal must be 0 or greater" },
      { status: 400, headers: corsHeaders },
    );
  }

  const coupon = await prisma.coupon.findUnique({ where: { code } });
  const quoted = quoteCoupon(coupon, subtotal);
  if (!quoted.ok) {
    return NextResponse.json(
      { valid: false, error: quoted.error },
      { status: 200, headers: corsHeaders },
    );
  }

  return NextResponse.json(
    {
      valid: true,
      code: quoted.quote.code,
      discountType: quoted.quote.discountType,
      discountValue: quoted.quote.discountValue,
      discountAmount: quoted.quote.discountAmount,
    },
    { headers: corsHeaders },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
