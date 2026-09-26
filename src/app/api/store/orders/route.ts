import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
};

function formatWhatsAppPhone(phone: string): string {
  let formatted = phone.trim().replace(/^\+/, "");
  if (formatted.startsWith("00")) formatted = formatted.slice(2);
  if (formatted.startsWith("0")) formatted = `20${formatted.slice(1)}`;
  return formatted;
}

async function sendWhatsApp(phone: string, message: string) {
  const formattedPhone = formatWhatsAppPhone(phone);
  const url = `https://api.green-api.com/waInstance${process.env.GREEN_API_ID_INSTANCE}/sendMessage/${process.env.GREEN_API_TOKEN_INSTANCE}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: `${formattedPhone}@c.us`,
        message,
      }),
    });
    const body = await response.text();
    console.log("[whatsapp] Green-API", formattedPhone, response.status, body);
  } catch (error) {
    console.error("[whatsapp] Green-API send failed", formattedPhone, error);
  }
}

function apiKeyMatches(provided: string, expected: string): boolean {
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  if (providedBytes.length === 0 || providedBytes.length !== expectedBytes.length) {
    return false;
  }
  return timingSafeEqual(providedBytes, expectedBytes);
}

/** POST /api/store/orders — storefront checkout. Requires x-api-key. */
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
      customerName?: unknown;
      phone?: unknown;
      address?: unknown;
      notes?: unknown;
      totalAmount?: unknown;
      items?: unknown;
    };

    const customerName = String(body.customerName ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    const address = String(body.address ?? "").trim();
    const notes =
      body.notes == null || String(body.notes).trim() === ""
        ? null
        : String(body.notes).trim();
    const totalAmount = Number(body.totalAmount);

    if (!customerName || !phone || !address) {
      return NextResponse.json(
        { error: "customerName, phone, and address are required" },
        { status: 400, headers: corsHeaders },
      );
    }
    if (!Number.isFinite(totalAmount) || totalAmount < 0) {
      return NextResponse.json(
        { error: "totalAmount must be a non-negative number" },
        { status: 400, headers: corsHeaders },
      );
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: "At least one order item is required" },
        { status: 400, headers: corsHeaders },
      );
    }

    const items = body.items.map((raw) => {
      const item = raw as {
        productId?: unknown;
        quantity?: unknown;
        price?: unknown;
      };
      return {
        productId: String(item.productId ?? "").trim(),
        quantity: Math.floor(Number(item.quantity)),
        price: Number(item.price),
      };
    });

    if (
      items.some(
        (item) =>
          !item.productId ||
          !Number.isFinite(item.quantity) ||
          item.quantity < 1 ||
          !Number.isFinite(item.price) ||
          item.price < 0,
      )
    ) {
      return NextResponse.json(
        { error: "Each item needs a productId, a quantity of at least 1, and a price" },
        { status: 400, headers: corsHeaders },
      );
    }

    const products = await prisma.product.findMany({
      where: { id: { in: items.map((item) => item.productId) }, isDeleted: false },
      select: { id: true },
    });
    if (products.length !== new Set(items.map((item) => item.productId)).size) {
      return NextResponse.json(
        { error: "One or more products were not found" },
        { status: 400, headers: corsHeaders },
      );
    }

    const order = await prisma.order.create({
      data: {
        customerName,
        phone,
        address,
        notes,
        totalAmount,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
          })),
        },
      },
      include: { items: true },
    });

    const notifyNumbers = (process.env.WHATSAPP_NOTIFY_NUMBERS ?? "")
      .split(",")
      .map((number) => number.trim())
      .filter(Boolean);
    const message = `🛒 أوردر جديد من المتجر!\n👤 العميل: ${order.customerName}\n📱 الهاتف: ${order.phone}\n📍 العنوان: ${order.address}\n💰 الإجمالي: ${order.totalAmount} EGP`;
    for (const notifyPhone of notifyNumbers) {
      void sendWhatsApp(notifyPhone, message);
    }

    return NextResponse.json(order, { status: 201, headers: corsHeaders });
  } catch (error) {
    console.error("[api/store/orders]", error);
    return NextResponse.json(
      { error: "Could not create order" },
      { status: 500, headers: corsHeaders },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
