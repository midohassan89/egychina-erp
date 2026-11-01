import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMobilePos } from "@/lib/pos/mobilePosAuth";
import { normalizeLoyaltyPhone } from "@/lib/pos/loyaltyScan";
import {
  mobilePosCorsHeaders,
  mobilePosJson,
  mobilePosOptions,
} from "@/lib/pos/mobilePosCors";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return mobilePosOptions();
}

/**
 * GET /api/mobile-pos/customer?phone=...
 */
export async function GET(request: Request) {
  const user = await requireMobilePos(request);
  if (!user) {
    return mobilePosJson({ error: "Unauthorized" }, 401);
  }

  const { searchParams } = new URL(request.url);
  const phone = normalizeLoyaltyPhone(searchParams.get("phone") ?? "");
  if (!phone) {
    return mobilePosJson({ error: "phone is required" }, 400);
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
      return mobilePosJson({ error: "Customer not found" }, 404);
    }

    return NextResponse.json(
      {
        ok: true,
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          pointsBalance: customer.pointsBalance,
        },
      },
      { headers: mobilePosCorsHeaders },
    );
  } catch (error) {
    console.error("[api/mobile-pos/customer]", error);
    return mobilePosJson({ error: "Lookup failed" }, 500);
  }
}
