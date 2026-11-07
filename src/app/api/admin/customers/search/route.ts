import { NextResponse } from "next/server";
import { canUsePos, isManagerOrAdmin } from "@/lib/auth/roles";
import { resolvePosAccess } from "@/lib/pos/deviceAuth";
import { normalizeLoyaltyPhone } from "@/lib/pos/loyaltyScan";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/customers/search?phone= — loyalty customer lookup for POS scans.
 * Auth: staff session or enrolled desktop device Bearer.
 */
export async function GET(request: Request) {
  const access = await resolvePosAccess(request);
  if (!access?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canUsePos(access.role) && !isManagerOrAdmin(access.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const phone = new URL(request.url).searchParams.get("phone")?.trim() ?? "";
  const sanitizedPhone = normalizeLoyaltyPhone(phone);
  if (!sanitizedPhone) {
    return NextResponse.json({ error: "phone is required" }, { status: 400 });
  }

  const customer = await prisma.customer.findFirst({
    where: { phone: { contains: sanitizedPhone } },
    select: {
      id: true,
      name: true,
      pointsBalance: true,
      phone: true,
    },
  });
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  return NextResponse.json(
    { customer },
    { headers: { "Cache-Control": "no-store" } },
  );
}
