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
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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

/**
 * GET /api/customer/addresses
 * Auth: x-api-key + (customerId OR phone)
 * Identity via: x-customer-id / x-customer-phone / Bearer / ?customerId= / ?phone=
 */
export async function GET(request: Request) {
  if (!requireStoreApiKey(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders },
    );
  }

  const customerId = resolveCustomerIdFromRequest(request);
  const phone = resolvePhoneFromRequest(request);

  if (!customerId && !phone) {
    return NextResponse.json(
      { error: "customerId or phone is required" },
      { status: 400, headers: corsHeaders },
    );
  }

  try {
    const customer = await resolveStoreCustomer(prisma, {
      customerId,
      phone,
      createIfMissing: false,
    });

    if (!customer) {
      // Phone-only lookup with no customer yet → empty list (not an error)
      if (phone && !customerId) {
        return NextResponse.json(
          { ok: true, addresses: [], customerId: null, phone },
          { headers: { ...corsHeaders, "Cache-Control": "no-store" } },
        );
      }
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404, headers: corsHeaders },
      );
    }

    const addresses = await prisma.customerAddress.findMany({
      where: { customerId: customer.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      include: addressInclude,
    });

    return NextResponse.json(
      {
        ok: true,
        customerId: customer.id,
        phone: customer.phone,
        addresses: addresses.map(serializeCustomerAddress),
      },
      { headers: { ...corsHeaders, "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[api/customer/addresses GET]", error);
    return NextResponse.json(
      { error: "Could not load addresses" },
      { status: 500, headers: corsHeaders },
    );
  }
}

/**
 * POST /api/customer/addresses
 * Body: { phone, fullName, title, fullAddress, isDefault?, customerId? }
 * Auth: x-api-key
 * Attaches an address to an existing customer. Does not create an account.
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
      customerId?: unknown;
      phone?: unknown;
      phoneNumber?: unknown;
      mobile?: unknown;
      name?: unknown;
      fullName?: unknown;
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
    };

    const customerId = resolveCustomerIdFromRequest(request, body.customerId);
    const phone = resolvePhoneFromRequest(
      request,
      body.phone ?? body.phoneNumber ?? body.mobile,
    );

    if (!phone && !customerId) {
      return NextResponse.json(
        { error: "phone or customerId is required" },
        { status: 400, headers: corsHeaders },
      );
    }

    const title = String(body.label ?? body.title ?? "").trim().slice(0, 80);
    const details = String(body.details ?? body.street ?? "").trim().slice(0, 1000);
    const fullAddress = String(body.fullAddress ?? body.address ?? details)
      .trim()
      .slice(0, 1000);
    const recipientName = String(body.recipientName ?? "").trim().slice(0, 120) || null;
    const addressPhone =
      String(body.addressPhone ?? body.contactPhone ?? "").trim().slice(0, 30) || null;
    const deliveryZoneId = String(body.deliveryZoneId ?? "").trim() || null;
    const isDefault = body.isDefault === true;

    if (!title) {
      return NextResponse.json(
        { error: "title is required" },
        { status: 400, headers: corsHeaders },
      );
    }
    if (!fullAddress) {
      return NextResponse.json(
        { error: "fullAddress is required" },
        { status: 400, headers: corsHeaders },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const customer = await resolveStoreCustomer(tx, {
        customerId,
        phone,
        createIfMissing: false,
      });

      if (!customer) {
        throw new Error("Customer not found");
      }

      const existingCount = await tx.customerAddress.count({
        where: { customerId: customer.id },
      });
      const makeDefault = isDefault || existingCount === 0;

      if (makeDefault) {
        await tx.customerAddress.updateMany({
          where: { customerId: customer.id, isDefault: true },
          data: { isDefault: false },
        });
      }

      if (deliveryZoneId) {
        const zone = await tx.deliveryZone.findFirst({
          where: { id: deliveryZoneId, isActive: true },
          select: { id: true },
        });
        if (!zone) throw new Error("Delivery zone not found");
      }

      const address = await tx.customerAddress.create({
        data: {
          customerId: customer.id,
          title,
          recipientName,
          fullAddress,
          details: details || null,
          phone: addressPhone,
          deliveryZoneId,
          isDefault: makeDefault,
        },
        include: addressInclude,
      });

      return { customer, address };
    });

    return NextResponse.json(
      {
        ok: true,
        customerId: result.customer.id,
        phone: result.customer.phone,
        fullName: result.customer.name,
        address: serializeCustomerAddress(result.address),
      },
      { status: 201, headers: corsHeaders },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not save address";
    if (message === "Customer not found" || message === "Delivery zone not found") {
      return NextResponse.json(
        { error: message },
        { status: message === "Customer not found" ? 404 : 400, headers: corsHeaders },
      );
    }
    console.error("[api/customer/addresses POST]", error);
    return NextResponse.json(
      { error: "Could not save address" },
      { status: 500, headers: corsHeaders },
    );
  }
}

/** PUT /api/customer/addresses — body must include id. */
export async function PUT(request: Request) {
  if (!requireStoreApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }
  let body: { id?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400, headers: corsHeaders });
  }
  const id = String(body.id ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400, headers: corsHeaders });
  }
  const forwarded = new Request(request.url, {
    method: "PATCH",
    headers: request.headers,
    body: JSON.stringify(body),
  });
  const { PATCH } = await import("./[id]/route");
  return PATCH(forwarded, { params: Promise.resolve({ id }) });
}

/** DELETE /api/customer/addresses?id= */
export async function DELETE(request: Request) {
  if (!requireStoreApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400, headers: corsHeaders });
  }
  const { DELETE: remove } = await import("./[id]/route");
  return remove(request, { params: Promise.resolve({ id }) });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
