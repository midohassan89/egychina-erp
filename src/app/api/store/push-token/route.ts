import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { normalizeLoyaltyPhone } from "@/lib/pos/loyaltyScan";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
};

function apiKeyMatches(provided: string, expected: string): boolean {
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  if (
    providedBytes.length === 0 ||
    providedBytes.length !== expectedBytes.length
  ) {
    return false;
  }
  return timingSafeEqual(providedBytes, expectedBytes);
}

/**
 * POST /api/store/push-token
 * Mobile app registers Expo push token for a customer phone.
 * Auth: x-api-key (same STORE_API_KEY as storefront orders).
 * Body: { phone, token }
 */
export async function POST(request: Request) {
  const expectedKey = process.env.STORE_API_KEY ?? "";
  const providedKey = request.headers.get("x-api-key") ?? "";
  if (!expectedKey || !apiKeyMatches(providedKey, expectedKey)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders },
    );
  }

  try {
    const body = (await request.json()) as {
      phone?: unknown;
      token?: unknown;
    };
    const phoneRaw = String(body.phone ?? "").trim();
    const token = String(body.token ?? "").trim();
    const phone = normalizeLoyaltyPhone(phoneRaw);

    if (!phone) {
      return NextResponse.json(
        { error: "phone is required" },
        { status: 400, headers: corsHeaders },
      );
    }
    if (!token) {
      return NextResponse.json(
        { error: "token is required" },
        { status: 400, headers: corsHeaders },
      );
    }

    const customer = await prisma.customer.findFirst({
      where: {
        OR: [
          { phone },
          { phone: { contains: phone } },
          ...(phone.startsWith("0")
            ? [
                { phone: `+20${phone.slice(1)}` },
                { phone: `20${phone.slice(1)}` },
              ]
            : []),
        ],
      },
      select: { id: true, phone: true },
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404, headers: corsHeaders },
      );
    }

    await prisma.customer.update({
      where: { id: customer.id },
      data: { expoPushToken: token },
    });

    return NextResponse.json(
      { ok: true, customerId: customer.id, phone: customer.phone },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("[api/store/push-token]", error);
    return NextResponse.json(
      { error: "Could not save push token" },
      { status: 500, headers: corsHeaders },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
