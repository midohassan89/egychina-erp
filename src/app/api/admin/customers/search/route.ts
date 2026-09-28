import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canUsePos, isManagerOrAdmin } from "@/lib/auth/roles";
import { normalizeLoyaltyPhone } from "@/lib/pos/loyaltyScan";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** GET /api/admin/customers/search?phone= — loyalty customer lookup for POS scans. */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canUsePos(session.user.role) && !isManagerOrAdmin(session.user.role)) {
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
