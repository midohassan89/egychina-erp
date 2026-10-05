import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireStoreApiKey,
  resolveCustomerIdFromRequest,
} from "@/lib/store/storeAuth";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, x-api-key, x-customer-id, Authorization",
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
 * Auth: x-api-key + customer id (x-customer-id | Bearer <id> | ?customerId=)
 */
export async function GET(request: Request) {
  if (!requireStoreApiKey(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders },
    );
  }

  const customerId = resolveCustomerIdFromRequest(request);
  if (!customerId) {
    return NextResponse.json(
      { error: "customerId is required" },
      { status: 400, headers: corsHeaders },
    );
  }

  try {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404, headers: corsHeaders },
      );
    }

    const addresses = await prisma.customerAddress.findMany({
      where: { customerId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json(
      { ok: true, addresses: addresses.map(serializeAddress) },
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
 * Body: { title, fullAddress, isDefault?, customerId? }
 * Auth: x-api-key + customer id (header / Bearer / body.customerId)
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
      title?: unknown;
      fullAddress?: unknown;
      address?: unknown;
      isDefault?: unknown;
    };

    const customerId = resolveCustomerIdFromRequest(request, body.customerId);
    if (!customerId) {
      return NextResponse.json(
        { error: "customerId is required" },
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

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404, headers: corsHeaders },
      );
    }

    const address = await prisma.$transaction(async (tx) => {
      const existingCount = await tx.customerAddress.count({
        where: { customerId },
      });
      const makeDefault = isDefault || existingCount === 0;

      if (makeDefault) {
        await tx.customerAddress.updateMany({
          where: { customerId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.customerAddress.create({
        data: {
          customerId,
          title,
          fullAddress,
          isDefault: makeDefault,
        },
      });
    });

    return NextResponse.json(
      { ok: true, address: serializeAddress(address) },
      { status: 201, headers: corsHeaders },
    );
  } catch (error) {
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
