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

function optionalName(value: unknown): string {
  return String(value ?? "").trim().slice(0, 120);
}

function serializeZone(zone: {
  id: string;
  nameAr: string;
  nameEn: string;
  nameZh: string;
  deliveryFee: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: zone.id,
    nameAr: zone.nameAr,
    nameEn: zone.nameEn,
    nameZh: zone.nameZh,
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

/**
 * GET /api/delivery-zones
 * Public callers receive active zones only.
 * A manager/admin session receives every zone so the dashboard can edit inactive ones.
 */
export async function GET() {
  const session = await auth();
  const includeInactive = Boolean(
    session?.user && isManagerOrAdmin(session.user.role),
  );
  const zones = await prisma.deliveryZone.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: [{ nameAr: "asc" }],
  });
  return NextResponse.json(
    { ok: true, zones: zones.map(serializeZone) },
    { headers: { ...corsHeaders, "Cache-Control": "no-store" } },
  );
}

/** POST /api/delivery-zones — body: { nameAr, nameEn?, nameZh?, deliveryFee, isActive? } */
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: {
    nameAr?: unknown;
    nameEn?: unknown;
    nameZh?: unknown;
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

  const nameAr = optionalName(body.nameAr);
  const deliveryFee = parseFee(body.deliveryFee);
  if (!nameAr) {
    return NextResponse.json(
      { error: "nameAr is required" },
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
      nameAr,
      nameEn: optionalName(body.nameEn),
      nameZh: optionalName(body.nameZh),
      deliveryFee,
      isActive: body.isActive === false ? false : true,
    },
  });

  return NextResponse.json(
    { ok: true, zone: serializeZone(zone) },
    { status: 201, headers: corsHeaders },
  );
}

/** PUT /api/delivery-zones — body: { id, nameAr?, nameEn?, nameZh?, deliveryFee?, isActive? } */
export async function PUT(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: {
    id?: unknown;
    nameAr?: unknown;
    nameEn?: unknown;
    nameZh?: unknown;
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

  const nameAr =
    body.nameAr !== undefined ? optionalName(body.nameAr) : undefined;
  if (nameAr === "") {
    return NextResponse.json(
      { error: "nameAr cannot be empty" },
      { status: 400, headers: corsHeaders },
    );
  }
  const nameEn =
    body.nameEn !== undefined ? optionalName(body.nameEn) : undefined;
  const nameZh =
    body.nameZh !== undefined ? optionalName(body.nameZh) : undefined;

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
      ...(nameAr !== undefined ? { nameAr } : {}),
      ...(nameEn !== undefined ? { nameEn } : {}),
      ...(nameZh !== undefined ? { nameZh } : {}),
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
