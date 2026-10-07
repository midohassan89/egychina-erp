import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireStoreApiKey,
  resolvePhoneFromRequest,
  resolveStoreCustomer,
} from "@/lib/store/storeAuth";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, x-api-key, x-customer-phone, x-phone, Authorization",
};

/**
 * POST /api/customer/push-token
 * Register a Firebase FCM device token for a customer (phone-based).
 * Auth: x-api-key (STORE_API_KEY)
 * Body: { phone, pushToken } — also accepts token / expoPushToken / fcmToken
 *
 * Creates a minimal Customer if the phone is new (logged in before first order).
 */
export async function POST(request: Request) {
  if (!requireStoreApiKey(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders },
    );
  }

  try {
    const body = (await request.json()) as {
      phone?: unknown;
      phoneNumber?: unknown;
      mobile?: unknown;
      pushToken?: unknown;
      token?: unknown;
      fcmToken?: unknown;
      expoPushToken?: unknown;
      fullName?: unknown;
      name?: unknown;
    };

    const phone = resolvePhoneFromRequest(
      request,
      body.phone ?? body.phoneNumber ?? body.mobile,
    );
    const pushToken = String(
      body.pushToken ?? body.token ?? body.fcmToken ?? body.expoPushToken ?? "",
    ).trim();
    const fullName =
      String(body.fullName ?? body.name ?? "").trim() || null;

    if (!phone) {
      return NextResponse.json(
        { error: "phone is required" },
        { status: 400, headers: corsHeaders },
      );
    }
    if (!pushToken) {
      return NextResponse.json(
        { error: "pushToken is required" },
        { status: 400, headers: corsHeaders },
      );
    }

    const customer = await resolveStoreCustomer(prisma, {
      phone,
      name: fullName,
      createIfMissing: true,
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Could not resolve customer" },
        { status: 400, headers: corsHeaders },
      );
    }

    const updated = await prisma.customer.update({
      where: { id: customer.id },
      data: {
        pushToken,
        // Keep Expo field in sync when the app still sends Expo-shaped tokens
        ...(pushToken.startsWith("ExponentPushToken")
          ? { expoPushToken: pushToken }
          : {}),
      },
      select: {
        id: true,
        phone: true,
        name: true,
        pushToken: true,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        customerId: updated.id,
        phone: updated.phone,
        fullName: updated.name,
        pushTokenSaved: Boolean(updated.pushToken),
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("[api/customer/push-token]", error);
    return NextResponse.json(
      { error: "Could not save push token" },
      { status: 500, headers: corsHeaders },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
