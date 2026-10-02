import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { normalizeLoyaltyPhone } from "@/lib/pos/loyaltyScan";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "PUT, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
};

function cleanEnvSecret(raw: string | undefined | null): string {
  let value = (raw ?? "").trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value.replace(/^["']+|["']+$/g, "").trim();
}

function apiKeyMatches(provided: string, expected: string): boolean {
  const a = cleanEnvSecret(provided);
  const b = cleanEnvSecret(expected);
  const providedBytes = Buffer.from(a);
  const expectedBytes = Buffer.from(b);
  if (
    providedBytes.length === 0 ||
    providedBytes.length !== expectedBytes.length
  ) {
    return false;
  }
  return timingSafeEqual(providedBytes, expectedBytes);
}

/**
 * PUT/POST /api/store/customer/token
 * Mobile app saves Expo push token on the Customer profile.
 * Auth: x-api-key (STORE_API_KEY)
 * Body: { phone, token } or { phone, expoPushToken }
 * Creates the customer if phone is new.
 */
async function saveCustomerToken(request: Request) {
  const expectedKey = cleanEnvSecret(process.env.STORE_API_KEY);
  const providedKey = cleanEnvSecret(
    request.headers.get("x-api-key") ??
      request.headers.get("X-API-KEY") ??
      "",
  );
  if (!expectedKey || !apiKeyMatches(providedKey, expectedKey)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders },
    );
  }

  try {
    const body = (await request.json()) as {
      phone?: unknown;
      phoneNumber?: unknown;
      token?: unknown;
      expoPushToken?: unknown;
      pushToken?: unknown;
      name?: unknown;
      fullName?: unknown;
    };

    const phoneRaw = String(body.phone ?? body.phoneNumber ?? "").trim();
    const token = String(
      body.token ?? body.expoPushToken ?? body.pushToken ?? "",
    ).trim();
    const phone = normalizeLoyaltyPhone(phoneRaw);
    const name = String(body.fullName ?? body.name ?? "").trim() || null;

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

    const existing = await prisma.customer.findFirst({
      where: {
        OR: [
          { phone },
          { phone: phoneRaw },
          { phone: { contains: phone.slice(-10) } },
        ],
      },
      select: { id: true, phone: true },
    });

    const customer = existing
      ? await prisma.customer.update({
          where: { id: existing.id },
          data: {
            expoPushToken: token,
            ...(name ? { name } : {}),
          },
          select: { id: true, phone: true, expoPushToken: true },
        })
      : await prisma.customer.create({
          data: {
            phone,
            name,
            expoPushToken: token,
          },
          select: { id: true, phone: true, expoPushToken: true },
        });

    return NextResponse.json(
      {
        ok: true,
        customerId: customer.id,
        phone: customer.phone,
        tokenSaved: Boolean(customer.expoPushToken),
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("[api/store/customer/token]", error);
    return NextResponse.json(
      { error: "Could not save push token" },
      { status: 500, headers: corsHeaders },
    );
  }
}

export async function PUT(request: Request) {
  return saveCustomerToken(request);
}

export async function POST(request: Request) {
  return saveCustomerToken(request);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
