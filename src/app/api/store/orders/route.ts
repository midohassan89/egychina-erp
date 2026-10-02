import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  applySaleStockChanges,
  syncSaleStockRows,
} from "@/lib/pos/applySaleStock";
import { persistSaleRecord } from "@/lib/reports/persistSale";

const POINTS_PER_EGP = 10;
const POINTS_FOR_ONE_EGP = 1000;
const SHIPPING_FEES = new Set([0, 50, 60, 80]);

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

/** Strip wrapping quotes + whitespace from .env values. */
function cleanEnvSecret(raw: string | undefined | null): string {
  let value = (raw ?? "").trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  // Also drop any leftover quote characters inside the secret
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

async function isAuthorizedStoreRequest(request: Request): Promise<boolean> {
  const expectedKey = cleanEnvSecret(process.env.STORE_API_KEY);
  const providedKey = cleanEnvSecret(
    request.headers.get("x-api-key") ??
      request.headers.get("X-API-KEY") ??
      "",
  );

  // TEMP debug — remove after fixing mobile 401
  console.log("Received Key:", providedKey, "Server Key:", expectedKey);

  if (expectedKey && apiKeyMatches(providedKey, expectedKey)) {
    return true;
  }

  const session = await auth();
  return Boolean(session?.user);
}

/** POST /api/store/orders — storefront checkout. Auth: x-api-key OR NextAuth session. */
export async function POST(request: Request) {
  if (!(await isAuthorizedStoreRequest(request))) {
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
      shippingFee?: unknown;
      customerId?: unknown;
      pointsRedeemed?: unknown;
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

    const customerId = typeof body.customerId === "string" ? body.customerId.trim() : "";
    const isGuest = customerId.length === 0;
    const pointsRedeemed = isGuest ? 0 : Number(body.pointsRedeemed ?? 0);
    const shippingFee = Number(body.shippingFee ?? 0);
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const discount = isGuest ? 0 : pointsRedeemed / POINTS_FOR_ONE_EGP;
    const paidGoods = Math.max(0, subtotal - discount);
    const pointsEarned = isGuest ? null : Math.floor(paidGoods * POINTS_PER_EGP);

    if (
      !Number.isInteger(pointsRedeemed) ||
      pointsRedeemed < 0 ||
      !SHIPPING_FEES.has(shippingFee) ||
      (!isGuest && discount - subtotal > 0.001) ||
      Math.abs((isGuest ? subtotal : paidGoods) + shippingFee - totalAmount) > 0.02
    ) {
      return NextResponse.json(
        { error: "Order total does not match the calculated amount" },
        { status: 400, headers: corsHeaders },
      );
    }

    const products = await prisma.product.findMany({
      where: { id: { in: items.map((item) => item.productId) }, isDeleted: false },
      select: { id: true, wcId: true, name: true },
    });
    if (products.length !== new Set(items.map((item) => item.productId)).size) {
      return NextResponse.json(
        { error: "One or more products were not found" },
        { status: 400, headers: corsHeaders },
      );
    }
    const productById = new Map(products.map((product) => [product.id, product]));

    const saleLines = items.map((item) => {
      const product = productById.get(item.productId)!;
      return {
        wcProductId: product.wcId,
        name: product.name,
        quantity: item.quantity,
        unitPrice: item.price,
        lineTotal: item.price * item.quantity,
      };
    });

    let wooRows: { wcId: number; stockQuantity: number }[] = [];
    const orderItems = items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      price: item.price,
    }));
    const order = await prisma.$transaction(async (tx) => {
      if (!isGuest) {
        const customer = await tx.customer.findUnique({
          where: { id: customerId },
          select: { id: true, pointsBalance: true },
        });

        if (!customer) {
          throw new Error("Customer not found");
        }

        if (pointsRedeemed > customer.pointsBalance) {
          throw new Error("Insufficient points");
        }

        await tx.customer.update({
          where: { id: customer.id },
          data: {
            pointsBalance: customer.pointsBalance - pointsRedeemed + (pointsEarned ?? 0),
          },
        });
      }

      const created = await tx.order.create({
        data: isGuest
          ? {
              customerName,
              phone,
              address,
              notes,
              totalAmount,
              items: { create: orderItems },
            }
          : {
              customerName,
              phone,
              address,
              notes,
              totalAmount,
              customerId,
              pointsEarned,
              pointsRedeemed,
              items: { create: orderItems },
            },
        include: { items: true },
      });

      if (!isGuest && pointsRedeemed > 0) {
        await tx.pointsTransaction.create({
          data: {
            customerId,
            points: -pointsRedeemed,
            type: "REDEEM",
            description: `Order ${created.id}`,
          },
        });
      }

      if (!isGuest && pointsEarned != null && pointsEarned > 0) {
        await tx.pointsTransaction.create({
          data: {
            customerId,
            points: pointsEarned,
            type: "EARN",
            description: `Order ${created.id}`,
          },
        });
      }

      const stockResult = await applySaleStockChanges({
        lines: saleLines.map((line) => ({
          wcProductId: line.wcProductId,
          quantity: line.quantity,
        })),
        syncAllWooStock: true,
        tx,
      });
      wooRows = stockResult.wooRows;
      const auditReason = stockResult.auditReasons.length
        ? stockResult.auditReasons.join("; ").slice(0, 500)
        : null;

      await persistSaleRecord(
        {
          total: totalAmount,
          paymentMethod: "store",
          customerName,
          requiresAudit: stockResult.auditReasons.length > 0,
          auditReason,
          lines: saleLines,
        },
        tx,
      );

      return created;
    });

    if (wooRows.length > 0) {
      const synced = await syncSaleStockRows(wooRows);
      if (synced.wooError) {
        console.error("[api/store/orders] WooCommerce stock sync", synced.wooError);
      }
    }

    const notifyNumbers = (process.env.WHATSAPP_NOTIFY_NUMBERS ?? "")
      .split(",")
      .map((number) => number.trim())
      .filter(Boolean);
    const message = `🛒 أوردر جديد من المتجر!\n👤 العميل: ${order.customerName}\n📱 الهاتف: ${order.phone}\n📍 العنوان: ${order.address}\n💰 الإجمالي: ${order.totalAmount} EGP`;
    for (const notifyPhone of notifyNumbers) {
      void sendWhatsApp(notifyPhone, message);
    }

    let customerPhone = order.phone.replace(/\D/g, "");
    if (customerPhone.startsWith("0")) customerPhone = "2" + customerPhone;
    if (!customerPhone.startsWith("20")) customerPhone = "20" + customerPhone;
    const customerMessage = `مرحباً ${order.customerName}،\nشكراً لطلبك من *ايجي شاينا ماركت* 🛒\n\nطلبك رقم *#${order.id}* تم استلامه وجاري تجهيزه الآن.\nالإجمالي: *${order.totalAmount} EGP*\n\nسنتواصل معك قريباً عند خروج الطلب للتوصيل 🚚\nلأي استفسار: 01009972972`;
    void sendWhatsApp(customerPhone, customerMessage);

    return NextResponse.json(order, { status: 201, headers: corsHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create order";

    if (message === "Customer not found" || message === "Insufficient points") {
      return NextResponse.json({ error: message }, { status: 400, headers: corsHeaders });
    }

    console.error("[api/store/orders]", error);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
