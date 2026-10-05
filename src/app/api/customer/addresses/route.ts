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
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, x-api-key, x-customer-id, x-customer-phone, x-phone, Authorization",
};

function serializeAddress(address: {
  id: string;
  customerId: string;
  title: string;
  fullAddress: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: address.id,
    customerId: address.customerId,
    title: address.title,
    fullAddress: address.fullAddress,
    isDefault: address.isDefault,
    createdAt: address.createdAt.toISOString(),
    updatedAt: address.updatedAt.toISOString(),
  };
}

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
    });

    return NextResponse.json(
      {
        ok: true,
        customerId: customer.id,
        phone: customer.phone,
        addresses: addresses.map(serializeAddress),
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
 * Lookup by phone → create with phone+fullName, or fill missing name, then attach address.
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
      fullAddress?: unknown;
      address?: unknown;
      isDefault?: unknown;
    };

    const customerId = resolveCustomerIdFromRequest(request, body.customerId);
    const phone = resolvePhoneFromRequest(
      request,
      body.phone ?? body.phoneNumber ?? body.mobile,
    );
    const fullName =
      String(body.fullName ?? body.name ?? "").trim() || null;

    if (!phone && !customerId) {
      return NextResponse.json(
        { error: "phone or customerId is required" },
        { status: 400, headers: corsHeaders },
      );
    }

    const title = String(body.title ?? "").trim().slice(0, 80);
    const fullAddress = String(body.fullAddress ?? body.address ?? "")
      .trim()
      .slice(0, 1000);
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
      // Phone-first: create with phone + fullName if new; fill name if blank
      const customer = await resolveStoreCustomer(tx, {
        customerId,
        phone,
        name: fullName,
        createIfMissing: Boolean(phone),
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

      const address = await tx.customerAddress.create({
        data: {
          customerId: customer.id,
          title,
          fullAddress,
          isDefault: makeDefault,
        },
      });

      return { customer, address };
    });

    return NextResponse.json(
      {
        ok: true,
        customerId: result.customer.id,
        phone: result.customer.phone,
        fullName: result.customer.name,
        address: serializeAddress(result.address),
      },
      { status: 201, headers: corsHeaders },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not save address";
    if (message === "Customer not found") {
      return NextResponse.json(
        { error: message },
        { status: 404, headers: corsHeaders },
      );
    }
    console.error("[api/customer/addresses POST]", error);
    return NextResponse.json(
      { error: "Could not save address" },
      { status: 500, headers: corsHeaders },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
