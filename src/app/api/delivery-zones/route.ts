import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isManagerOrAdmin } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function serializeZone(zone: {
  id: string;
  name: string;
  deliveryFee: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: zone.id,
    name: zone.name,
    deliveryFee: zone.deliveryFee,
    isActive: zone.isActive,
    createdAt: zone.createdAt.toISOString(),
    updatedAt: zone.updatedAt.toISOString(),
  };
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders },
    );
  }
  if (!isManagerOrAdmin(session.user.role)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: corsHeaders },
    );
  }
  return null;
}

function parseFee(value: unknown): number | null {
  const fee = Number(value);
  if (!Number.isFinite(fee) || fee < 0) return null;
  return fee;
}

/** GET /api/delivery-zones — public list of active zones. */
export async function GET() {
  const zones = await prisma.deliveryZone.findMany({
    where: { isActive: true },
    orderBy: [{ name: "asc" }],
  });
  return NextResponse.json(
    { ok: true, zones: zones.map(serializeZone) },
    { headers: { ...corsHeaders, "Cache-Control": "no-store" } },
  );
}

/** POST /api/delivery-zones — body: { name, deliveryFee, isActive? } */
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: { name?: unknown; deliveryFee?: unknown; isActive?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400, headers: corsHeaders },
    );
  }

  const name = String(body.name ?? "").trim().slice(0, 120);
  const deliveryFee = parseFee(body.deliveryFee);
  if (!name) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400, headers: corsHeaders },
    );
  }
  if (deliveryFee == null) {
    return NextResponse.json(
      { error: "deliveryFee must be 0 or greater" },
      { status: 400, headers: corsHeaders },
    );
  }

  const zone = await prisma.deliveryZone.create({
    data: {
      name,
      deliveryFee,
      isActive: body.isActive === false ? false : true,
    },
  });

  return NextResponse.json(
    { ok: true, zone: serializeZone(zone) },
    { status: 201, headers: corsHeaders },
  );
}

/** PUT /api/delivery-zones — body: { id, name?, deliveryFee?, isActive? } */
export async function PUT(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: {
    id?: unknown;
    name?: unknown;
    deliveryFee?: unknown;
    isActive?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400, headers: corsHeaders },
    );
  }

  const id = String(body.id ?? "").trim();
  if (!id) {
    return NextResponse.json(
      { error: "id is required" },
      { status: 400, headers: corsHeaders },
    );
  }

  const existing = await prisma.deliveryZone.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(
      { error: "Delivery zone not found" },
      { status: 404, headers: corsHeaders },
    );
  }

  const name =
    body.name !== undefined ? String(body.name).trim().slice(0, 120) : undefined;
  if (name === "") {
    return NextResponse.json(
      { error: "name cannot be empty" },
      { status: 400, headers: corsHeaders },
    );
  }

  let deliveryFee: number | undefined;
  if (body.deliveryFee !== undefined) {
    const parsed = parseFee(body.deliveryFee);
    if (parsed == null) {
      return NextResponse.json(
        { error: "deliveryFee must be 0 or greater" },
        { status: 400, headers: corsHeaders },
      );
    }
    deliveryFee = parsed;
  }

  const zone = await prisma.deliveryZone.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(deliveryFee !== undefined ? { deliveryFee } : {}),
      ...(typeof body.isActive === "boolean" ? { isActive: body.isActive } : {}),
    },
  });

  return NextResponse.json(
    { ok: true, zone: serializeZone(zone) },
    { headers: corsHeaders },
  );
}

/** DELETE /api/delivery-zones — body or query: { id } / ?id= */
export async function DELETE(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const url = new URL(request.url);
  let id = url.searchParams.get("id")?.trim() ?? "";
  if (!id) {
    try {
      const body = (await request.json()) as { id?: unknown };
      id = String(body.id ?? "").trim();
    } catch {
      id = "";
    }
  }
  if (!id) {
    return NextResponse.json(
      { error: "id is required" },
      { status: 400, headers: corsHeaders },
    );
  }

  const existing = await prisma.deliveryZone.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Delivery zone not found" },
      { status: 404, headers: corsHeaders },
    );
  }

  await prisma.deliveryZone.delete({ where: { id } });
  return NextResponse.json({ ok: true }, { headers: corsHeaders });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
