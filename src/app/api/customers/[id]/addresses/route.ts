import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isManagerOrAdmin } from "@/lib/auth/roles";
import { requireStoreApiKey } from "@/lib/store/storeAuth";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
};

function serializeAddress(address: {
  id: string;
  customerId: string;
  title: string;
  street: string;
  city: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: address.id,
    customerId: address.customerId,
    title: address.title,
    street: address.street,
    city: address.city,
    isDefault: address.isDefault,
    createdAt: address.createdAt.toISOString(),
    updatedAt: address.updatedAt.toISOString(),
  };
}

async function canAccess(request: Request): Promise<boolean> {
  if (requireStoreApiKey(request)) return true;
  const session = await auth();
  return Boolean(session?.user && isManagerOrAdmin(session.user.role));
}

async function customerExists(id: string): Promise<boolean> {
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { id: true },
  });
  return Boolean(customer);
}

/** GET /api/customers/[id]/addresses */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await canAccess(request))) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders },
    );
  }

  const { id } = await context.params;
  if (!(await customerExists(id))) {
    return NextResponse.json(
      { error: "Customer not found" },
      { status: 404, headers: corsHeaders },
    );
  }

  const addresses = await prisma.address.findMany({
    where: { customerId: id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(
    { ok: true, addresses: addresses.map(serializeAddress) },
    { headers: { ...corsHeaders, "Cache-Control": "no-store" } },
  );
}

/** POST /api/customers/[id]/addresses — body: { title, street, city, isDefault? } */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await canAccess(request))) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders },
    );
  }

  const { id } = await context.params;
  if (!(await customerExists(id))) {
    return NextResponse.json(
      { error: "Customer not found" },
      { status: 404, headers: corsHeaders },
    );
  }

  let body: {
    title?: unknown;
    street?: unknown;
    city?: unknown;
    isDefault?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400, headers: corsHeaders },
    );
  }

  const title = String(body.title ?? "").trim().slice(0, 80);
  const street = String(body.street ?? "").trim().slice(0, 300);
  const city = String(body.city ?? "").trim().slice(0, 120);
  if (!title || !street || !city) {
    return NextResponse.json(
      { error: "title, street, and city are required" },
      { status: 400, headers: corsHeaders },
    );
  }

  const address = await prisma.$transaction(async (tx) => {
    const count = await tx.address.count({ where: { customerId: id } });
    const makeDefault = body.isDefault === true || count === 0;
    if (makeDefault) {
      await tx.address.updateMany({
        where: { customerId: id, isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.address.create({
      data: {
        customerId: id,
        title,
        street,
        city,
        isDefault: makeDefault,
      },
    });
  });

  return NextResponse.json(
    { ok: true, address: serializeAddress(address) },
    { status: 201, headers: corsHeaders },
  );
}

/** PUT /api/customers/[id]/addresses — body: { id, title?, street?, city?, isDefault? } */
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await canAccess(request))) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders },
    );
  }

  const { id: customerId } = await context.params;
  let body: {
    id?: unknown;
    addressId?: unknown;
    title?: unknown;
    street?: unknown;
    city?: unknown;
    isDefault?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400, headers: corsHeaders },
    );
  }

  const addressId = String(body.id ?? body.addressId ?? "").trim();
  if (!addressId) {
    return NextResponse.json(
      { error: "address id is required" },
      { status: 400, headers: corsHeaders },
    );
  }

  const existing = await prisma.address.findFirst({
    where: { id: addressId, customerId },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Address not found" },
      { status: 404, headers: corsHeaders },
    );
  }

  const title =
    body.title !== undefined ? String(body.title).trim().slice(0, 80) : undefined;
  const street =
    body.street !== undefined
      ? String(body.street).trim().slice(0, 300)
      : undefined;
  const city =
    body.city !== undefined ? String(body.city).trim().slice(0, 120) : undefined;
  if (title === "" || street === "" || city === "") {
    return NextResponse.json(
      { error: "title, street, and city cannot be empty" },
      { status: 400, headers: corsHeaders },
    );
  }

  const address = await prisma.$transaction(async (tx) => {
    if (body.isDefault === true) {
      await tx.address.updateMany({
        where: { customerId, isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.address.update({
      where: { id: addressId },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(street !== undefined ? { street } : {}),
        ...(city !== undefined ? { city } : {}),
        ...(typeof body.isDefault === "boolean"
          ? { isDefault: body.isDefault }
          : {}),
      },
    });
  });

  return NextResponse.json(
    { ok: true, address: serializeAddress(address) },
    { headers: corsHeaders },
  );
}

/** DELETE /api/customers/[id]/addresses — body or query: { id } / ?addressId= */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await canAccess(request))) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders },
    );
  }

  const { id: customerId } = await context.params;
  const url = new URL(request.url);
  let addressId = url.searchParams.get("addressId")?.trim() ?? "";
  if (!addressId) {
    try {
      const body = (await request.json()) as { id?: unknown; addressId?: unknown };
      addressId = String(body.id ?? body.addressId ?? "").trim();
    } catch {
      addressId = "";
    }
  }
  if (!addressId) {
    return NextResponse.json(
      { error: "address id is required" },
      { status: 400, headers: corsHeaders },
    );
  }

  const existing = await prisma.address.findFirst({
    where: { id: addressId, customerId },
    select: { id: true, isDefault: true },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Address not found" },
      { status: 404, headers: corsHeaders },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.address.delete({ where: { id: addressId } });
    if (existing.isDefault) {
      const next = await tx.address.findFirst({
        where: { customerId },
        orderBy: { createdAt: "desc" },
      });
      if (next) {
        await tx.address.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }
  });

  return NextResponse.json({ ok: true }, { headers: corsHeaders });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
