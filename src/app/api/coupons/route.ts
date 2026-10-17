import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isManagerOrAdmin } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function optionalNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parseDiscountType(value: unknown): "PERCENTAGE" | "FIXED" | null {
  const type = String(value ?? "PERCENTAGE").trim().toUpperCase();
  if (type === "PERCENTAGE" || type === "FIXED") return type;
  return null;
}

async function requireManager() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isManagerOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

function serializeCoupon(coupon: {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
  minOrder: number;
  maxDiscount: number | null;
  usageLimit: number | null;
  usedCount: number;
  expiresAt: Date | null;
  isActive: boolean;
  createdAt: Date;
}) {
  return {
    ...coupon,
    expiresAt: coupon.expiresAt?.toISOString() ?? null,
    createdAt: coupon.createdAt.toISOString(),
  };
}

export async function GET() {
  const denied = await requireManager();
  if (denied) return denied;

  const coupons = await prisma.coupon.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ ok: true, coupons: coupons.map(serializeCoupon) });
}

export async function POST(request: Request) {
  const denied = await requireManager();
  if (denied) return denied;

  let body: {
    code?: unknown;
    discountType?: unknown;
    discountValue?: unknown;
    minOrder?: unknown;
    maxDiscount?: unknown;
    usageLimit?: unknown;
    expiresAt?: unknown;
    isActive?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const code = String(body.code ?? "").trim().toUpperCase();
  const discountType = parseDiscountType(body.discountType);
  const discountValue = optionalNumber(body.discountValue);
  const minOrder = body.minOrder == null || body.minOrder === "" ? 0 : optionalNumber(body.minOrder);
  const maxDiscount =
    body.maxDiscount == null || body.maxDiscount === ""
      ? null
      : optionalNumber(body.maxDiscount);
  const usageLimit =
    body.usageLimit == null || body.usageLimit === ""
      ? null
      : optionalNumber(body.usageLimit);

  if (!code || !/^[A-Z0-9_-]{2,40}$/.test(code)) {
    return NextResponse.json(
      { error: "code must be 2–40 letters, numbers, _ or -" },
      { status: 400 },
    );
  }
  if (!discountType) {
    return NextResponse.json({ error: "discountType is invalid" }, { status: 400 });
  }
  if (discountValue == null || discountValue <= 0) {
    return NextResponse.json(
      { error: "discountValue must be greater than 0" },
      { status: 400 },
    );
  }
  if (discountType === "PERCENTAGE" && discountValue > 100) {
    return NextResponse.json(
      { error: "Percentage discount cannot exceed 100" },
      { status: 400 },
    );
  }
  if (minOrder == null) {
    return NextResponse.json({ error: "minOrder must be 0 or greater" }, { status: 400 });
  }
  if (body.maxDiscount != null && body.maxDiscount !== "" && maxDiscount == null) {
    return NextResponse.json({ error: "maxDiscount must be 0 or greater" }, { status: 400 });
  }
  if (
    usageLimit != null &&
    (!Number.isInteger(usageLimit) || usageLimit < 1)
  ) {
    return NextResponse.json(
      { error: "usageLimit must be a whole number of 1 or more" },
      { status: 400 },
    );
  }

  let expiresAt: Date | null = null;
  if (body.expiresAt != null && String(body.expiresAt).trim()) {
    expiresAt = new Date(String(body.expiresAt));
    if (Number.isNaN(expiresAt.getTime())) {
      return NextResponse.json({ error: "expiresAt is invalid" }, { status: 400 });
    }
  }

  const existing = await prisma.coupon.findUnique({ where: { code }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: "This code already exists" }, { status: 409 });
  }

  const coupon = await prisma.coupon.create({
    data: {
      code,
      discountType,
      discountValue,
      minOrder,
      maxDiscount,
      usageLimit,
      expiresAt,
      isActive: body.isActive === false ? false : true,
    },
  });

  return NextResponse.json(
    { ok: true, coupon: serializeCoupon(coupon) },
    { status: 201 },
  );
}
