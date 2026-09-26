import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isManagerOrAdmin } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";

const ORDER_STATUSES = [
  "قيد الانتظار",
  "جاري التجهيز",
  "مكتمل",
  "ملغي",
] as const;

/** PATCH /api/admin/orders/[id] — update a storefront order status. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isManagerOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Invalid order" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as { status?: unknown };
    const status = String(body.status ?? "");
    if (!ORDER_STATUSES.includes(status as (typeof ORDER_STATUSES)[number])) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const order = await prisma.order.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json(order);
  } catch (error) {
    console.error("[api/admin/orders/[id]]", error);
    return NextResponse.json(
      { error: "Could not update order" },
      { status: 500 },
    );
  }
}
