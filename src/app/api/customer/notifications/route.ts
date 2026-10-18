import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireStoreApiKey,
  resolveCustomerIdFromRequest,
  resolvePhoneFromRequest,
  resolveStoreCustomer,
} from "@/lib/store/storeAuth";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, x-api-key, x-customer-id, x-customer-phone, x-phone, Authorization",
};

export async function GET(request: Request) {
  if (!requireStoreApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }
  const customer = await resolveStoreCustomer(prisma, {
    customerId: resolveCustomerIdFromRequest(request),
    phone: resolvePhoneFromRequest(request),
    createIfMissing: false,
  });
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404, headers: corsHeaders });
  }

  const notifications = await prisma.customerNotification.findMany({
    where: { OR: [{ customerId: customer.id }, { customerId: null }] },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    ok: true,
    notifications: notifications.map((row) => ({
      id: row.id,
      titleAr: row.titleAr,
      titleEn: row.titleEn,
      titleZh: row.titleZh,
      bodyAr: row.bodyAr,
      bodyEn: row.bodyEn,
      bodyZh: row.bodyZh,
      type: row.type,
      orderId: row.orderId,
      isRead: row.isRead,
      createdAt: row.createdAt.toISOString(),
    })),
  }, { headers: corsHeaders });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
