import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  applySaleStockChanges,
  syncSaleStockRows,
} from "@/lib/pos/applySaleStock";
import { normalizeLoyaltyPhone } from "@/lib/pos/loyaltyScan";
import { persistSaleRecord } from "@/lib/reports/persistSale";
import { resolveStoreCustomer } from "@/lib/store/storeAuth";
import { getLoyaltySettings } from "@/lib/loyalty/settings";

const SHIPPING_FEES = new Set([0, 50, 60, 80]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

function requireStoreApiKey(request: Request): boolean {
  const expectedKey = cleanEnvSecret(process.env.STORE_API_KEY);
  const providedKey = cleanEnvSecret(
    request.headers.get("x-api-key") ??
      request.headers.get("X-API-KEY") ??
      "",
  );
  return Boolean(expectedKey && apiKeyMatches(providedKey, expectedKey));
}

/**
 * GET /api/store/orders?phone=01…
 * Returns past orders for a customer phone. Requires x-api-key.
 */
export async function GET(request: Request) {
  if (!requireStoreApiKey(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders },
    );
  }

  try {
    const phoneRaw =
      new URL(request.url).searchParams.get("phone")?.trim() ?? "";
    const phone = normalizeLoyaltyPhone(phoneRaw);
    if (!phone) {
      return NextResponse.json(
        { error: "phone is required" },
        { status: 400, headers: corsHeaders },
      );
    }

    const customer = await prisma.customer.findFirst({
      where: {
        OR: [
          { phone },
          { phone: phoneRaw },
          { phone: { contains: phone.slice(-10) } },
        ],
      },
      select: {
        id: true,
        name: true,
        phone: true,
        pointsBalance: true,
      },
    });

    const orders = await prisma.order.findMany({
      where: {
        OR: [
          { phone },
          { phone: phoneRaw },
          { phone: { contains: phone.slice(-10) } },
          {
            customer: {
              OR: [
                { phone },
                { phone: { contains: phone.slice(-10) } },
              ],
            },
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, imageUrl: true } },
          },
        },
      },
    });

    return NextResponse.json(
      {
        pointsBalance: customer?.pointsBalance ?? 0,
        customer: customer
          ? {
              id: customer.id,
              name: customer.name,
              phone: customer.phone,
              pointsBalance: customer.pointsBalance,
            }
          : null,
        orders: orders.map((order) => ({
          id: order.id,
          customerName: order.customerName,
          phone: order.phone,
          address: order.address,
          customerAddressId: order.customerAddressId,
          notes: order.notes,
          totalAmount: order.totalAmount,
          status: order.status,
          createdAt: order.createdAt.toISOString(),
          items: order.items.map((item) => ({
            id: item.id,
            productId: item.productId,
            productName: item.product.name,
            imageUrl: item.product.imageUrl,
            quantity: item.quantity,
            price: item.price,
          })),
        })),
      },
      { headers: { ...corsHeaders, "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[api/store/orders GET]", error);
    return NextResponse.json(
      { error: "Could not load orders" },
      { status: 500, headers: corsHeaders },
    );
  }
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
      fullName?: unknown;
      name?: unknown;
      phone?: unknown;
      phoneNumber?: unknown;
      mobile?: unknown;
      contact?: unknown;
      address?: unknown;
      fullAddress?: unknown;
      deliveryAddress?: unknown;
      customerAddressId?: unknown;
      addressId?: unknown;
      notes?: unknown;
      instructions?: unknown;
      totalAmount?: unknown;
      totalPrice?: unknown;
      shippingFee?: unknown;
      customerId?: unknown;
      pointsRedeemed?: unknown;
      expoPushToken?: unknown;
      pushToken?: unknown;
      items?: unknown;
      customer?: {
        phone?: unknown;
        phoneNumber?: unknown;
        mobile?: unknown;
        name?: unknown;
        fullName?: unknown;
        address?: unknown;
        fullAddress?: unknown;
        expoPushToken?: unknown;
        pushToken?: unknown;
      };
    };

    // TEMP debug — remove once mobile checkout is stable
    console.log("INCOMING ORDER BODY:", body);

    const pickString = (...values: unknown[]) => {
      for (const value of values) {
        if (value == null) continue;
        const text = String(value).trim();
        if (text) return text;
      }
      return "";
    };

    const nested = body.customer ?? {};
    const providedFullName = pickString(
      nested.fullName,
      nested.name,
      body.customerName,
      body.fullName,
      body.name,
    );
    const finalName = providedFullName || "عميل المتجر";
    const finalPhone = pickString(
      nested.phone,
      nested.phoneNumber,
      nested.mobile,
      body.phone,
      body.phoneNumber,
      body.mobile,
      body.contact,
    );
    const customerAddressId = pickString(
      body.customerAddressId,
      body.addressId,
    );
    let finalAddress = pickString(
      nested.fullAddress,
      nested.address,
      body.fullAddress,
      body.address,
      body.deliveryAddress,
    );
    let linkedAddressId: string | null = null;

    // Prefer a saved CustomerAddress when customerAddressId is provided
    let addressOwnerCustomerId: string | null = null;
    if (customerAddressId) {
      const savedAddress = await prisma.customerAddress.findUnique({
        where: { id: customerAddressId },
        select: {
          id: true,
          fullAddress: true,
          customerId: true,
        },
      });
      if (!savedAddress) {
        return NextResponse.json(
          { error: "customerAddressId not found" },
          { status: 400, headers: corsHeaders },
        );
      }
      const bodyCustomerId =
        typeof body.customerId === "string" ? body.customerId.trim() : "";
      if (bodyCustomerId && savedAddress.customerId !== bodyCustomerId) {
        return NextResponse.json(
          { error: "customerAddressId does not belong to this customer" },
          { status: 403, headers: corsHeaders },
        );
      }
      finalAddress = savedAddress.fullAddress;
      linkedAddressId = savedAddress.id;
      addressOwnerCustomerId = savedAddress.customerId;
    }

    if (!finalAddress) {
      finalAddress = "العين السخنة";
    }

    const notesRaw = pickString(body.notes, body.instructions);
    const notes = notesRaw || null;
    const finalTotal = Number(body.totalPrice ?? body.totalAmount ?? 0);
    const expoPushToken = pickString(
      nested.expoPushToken,
      nested.pushToken,
      body.expoPushToken,
      body.pushToken,
    );

    if (!finalPhone) {
      return NextResponse.json(
        { error: "phone is required" },
        { status: 400, headers: corsHeaders },
      );
    }
    if (!Number.isFinite(finalTotal) || finalTotal < 0) {
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
        id?: unknown;
        quantity?: unknown;
        qty?: unknown;
        price?: unknown;
        unitPrice?: unknown;
        lineTotal?: unknown;
      };
      const itemPrice = Number(item.price ?? item.unitPrice ?? 0);
      return {
        productId: String(item.productId ?? item.id ?? "").trim(),
        quantity: Math.floor(Number(item.quantity ?? item.qty ?? 0)),
        price: itemPrice,
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

    const customerId =
      (typeof body.customerId === "string" ? body.customerId.trim() : "") ||
      addressOwnerCustomerId ||
      "";
    const isGuest = customerId.length === 0;
    const pointsRedeemed = isGuest ? 0 : Number(body.pointsRedeemed ?? 0);
    const loyalty = await getLoyaltySettings();
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const discount = isGuest ? 0 : pointsRedeemed / loyalty.pointsRedeemValue;
    const paidGoods = Math.max(0, subtotal - discount);
    const pointsEarned = isGuest
      ? null
      : Math.floor(paidGoods * loyalty.pointsEarnRatio);

    // Mobile often sends only totalPrice (goods + shipping) without shippingFee
    let shippingFee = Number(body.shippingFee);
    if (!Number.isFinite(shippingFee)) {
      const inferred = Math.round((finalTotal - (isGuest ? subtotal : paidGoods)) * 100) / 100;
      shippingFee = SHIPPING_FEES.has(inferred) ? inferred : 0;
    }

    if (
      !Number.isInteger(pointsRedeemed) ||
      pointsRedeemed < 0 ||
      !SHIPPING_FEES.has(shippingFee) ||
      (!isGuest && discount - subtotal > 0.001) ||
      Math.abs((isGuest ? subtotal : paidGoods) + shippingFee - finalTotal) > 0.02
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
      const normalizedPhone = normalizeLoyaltyPhone(finalPhone);
      let linkedCustomerId = customerId || null;

      // Resolve / create Customer by phone + fullName (fill name if missing)
      if (normalizedPhone || linkedCustomerId) {
        const resolved = await resolveStoreCustomer(tx, {
          customerId: linkedCustomerId ?? undefined,
          phone: normalizedPhone || finalPhone,
          // Only persist a real provided name — not the "عميل المتجر" fallback
          name: providedFullName || null,
          createIfMissing: Boolean(normalizedPhone || finalPhone),
        });

        const customer = resolved
          ? await tx.customer.findUnique({
              where: { id: resolved.id },
              select: { id: true, name: true, pointsBalance: true },
            })
          : null;

        if (!customer) {
          if (!isGuest) throw new Error("Customer not found");
        } else {
          linkedCustomerId = customer.id;

          if (!isGuest) {
            if (pointsRedeemed > customer.pointsBalance) {
              throw new Error("Insufficient points");
            }
            await tx.customer.update({
              where: { id: customer.id },
              data: {
                pointsBalance:
                  customer.pointsBalance - pointsRedeemed + (pointsEarned ?? 0),
                ...(expoPushToken ? { expoPushToken } : {}),
              },
            });
          } else if (expoPushToken) {
            await tx.customer.update({
              where: { id: customer.id },
              data: { expoPushToken },
            });
          }
        }
      }

      const created = await tx.order.create({
        data: {
          customerName: finalName,
          phone: finalPhone,
          address: finalAddress,
          ...(linkedAddressId ? { customerAddressId: linkedAddressId } : {}),
          notes,
          totalAmount: finalTotal,
          ...(linkedCustomerId ? { customerId: linkedCustomerId } : {}),
          ...(!isGuest
            ? { pointsEarned, pointsRedeemed }
            : {}),
          items: { create: orderItems },
        },
        include: { items: true },
      });

      if (!isGuest && linkedCustomerId && pointsRedeemed > 0) {
        await tx.pointsTransaction.create({
          data: {
            customerId: linkedCustomerId,
            points: -pointsRedeemed,
            type: "REDEEM",
            description: `Order ${created.id}`,
          },
        });
      }

      if (
        !isGuest &&
        linkedCustomerId &&
        pointsEarned != null &&
        pointsEarned > 0
      ) {
        await tx.pointsTransaction.create({
          data: {
            customerId: linkedCustomerId,
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
          total: finalTotal,
          paymentMethod: "store",
          customerName: finalName,
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

    return NextResponse.json(
      {
        ...order,
        customerId: order.customerId,
        fullName: order.customerName,
      },
      { status: 201, headers: corsHeaders },
    );
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
