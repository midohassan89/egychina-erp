import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMobilePos } from "@/lib/pos/mobilePosAuth";
import { normalizeLoyaltyPhone } from "@/lib/pos/loyaltyScan";

/**
 * GET /api/mobile-pos/customer?phone=...
 */
export async function GET(request: Request) {
  const user = await requireMobilePos(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const phone = normalizeLoyaltyPhone(searchParams.get("phone") ?? "");
  if (!phone) {
    return NextResponse.json({ error: "phone is required" }, { status: 400 });
  }

  try {
    const customer = await prisma.customer.findFirst({
      where: {
        phone,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        pointsBalance: true,
      },
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        pointsBalance: customer.pointsBalance,
      },
    });
  } catch (error) {
    console.error("[api/mobile-pos/customer]", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
