import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeCustomerAddress } from "@/lib/customers/profile";
import {
  requireStoreApiKey,
  resolveCustomerIdFromRequest,
  resolvePhoneFromRequest,
  resolveStoreCustomer,
} from "@/lib/store/storeAuth";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "PATCH, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, x-api-key, x-customer-id, x-customer-phone, x-phone, Authorization",
};

const addressInclude = {
  deliveryZone: {
    select: {
      id: true,
      nameAr: true,
      nameEn: true,
      nameZh: true,
      deliveryFee: true,
      minOrder: true,
      estimatedTime: true,
    },
  },
} as const;

async function ownedAddress(request: Request, id: string, body?: {
  customerId?: unknown;
  phone?: unknown;
}) {
  const customerId = resolveCustomerIdFromRequest(request, body?.customerId);
  const phone = resolvePhoneFromRequest(request, body?.phone);
  const customer = await resolveStoreCustomer(prisma, {
    customerId,
    phone,
    createIfMissing: false,
  });
  if (!customer) return { customer: null, address: null };
  const address = await prisma.customerAddress.findFirst({
    where: { id, customerId: customer.id },
  });
  return { customer, address };
}

/** PATCH /api/customer/addresses/[id] — rename, replace the text, or set default. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!requireStoreApiKey(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders },
    );
  }

  const { id } = await context.params;
  let body: {
    customerId?: unknown;
    phone?: unknown;
    title?: unknown;
    label?: unknown;
    recipientName?: unknown;
    fullAddress?: unknown;
    address?: unknown;
    details?: unknown;
    street?: unknown;
    contactPhone?: unknown;
    addressPhone?: unknown;
    deliveryZoneId?: unknown;
    isDefault?: unknown;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const { customer, address } = await ownedAddress(request, id, body);
  if (!customer || !address) {
    return NextResponse.json(
      { error: "Address not found" },
      { status: 404, headers: corsHeaders },
    );
  }

  const title = String(body.label ?? body.title ?? address.title).trim().slice(0, 80);
  const details = String(
    body.details ?? body.street ?? address.details ?? "",
  ).trim().slice(0, 1000);
  const fullAddress = String(body.fullAddress ?? body.address ?? address.fullAddress)
    .trim()
    .slice(0, 1000);
  const recipientName =
    body.recipientName !== undefined
      ? String(body.recipientName ?? "").trim().slice(0, 120) || null
      : address.recipientName;
  const addressPhone =
    body.addressPhone !== undefined || body.contactPhone !== undefined
      ? String(body.addressPhone ?? body.contactPhone ?? "").trim().slice(0, 30) || null
      : address.phone;
  const deliveryZoneId =
    body.deliveryZoneId !== undefined
      ? String(body.deliveryZoneId ?? "").trim() || null
      : address.deliveryZoneId;
  if (!title || !fullAddress) {
    return NextResponse.json(
      { error: "title and fullAddress are required" },
      { status: 400, headers: corsHeaders },
    );
  }

  const makeDefault = body.isDefault === true;
  const updated = await prisma.$transaction(async (tx) => {
    if (makeDefault) {
      await tx.customerAddress.updateMany({
        where: { customerId: customer.id, isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.customerAddress.update({
      where: { id: address.id },
      data: {
        title,
        fullAddress,
        details: details || null,
        recipientName,
        phone: addressPhone,
        deliveryZoneId,
        ...(body.isDefault === true || body.isDefault === false
          ? { isDefault: body.isDefault === true }
          : {}),
      },
      include: addressInclude,
    });
  });

  return NextResponse.json(
    { ok: true, address: serializeCustomerAddress(updated) },
    { headers: corsHeaders },
  );
}

export const PUT = PATCH;

/** DELETE /api/customer/addresses/[id] */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!requireStoreApiKey(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders },
    );
  }

  const { id } = await context.params;
  const { address } = await ownedAddress(request, id);
  if (!address) {
    return NextResponse.json(
      { error: "Address not found" },
      { status: 404, headers: corsHeaders },
    );
  }

  await prisma.customerAddress.delete({ where: { id: address.id } });
  return NextResponse.json({ ok: true }, { headers: corsHeaders });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
