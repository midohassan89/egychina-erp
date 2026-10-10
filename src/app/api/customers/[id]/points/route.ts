import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isManagerOrAdmin } from "@/lib/auth/roles";

/**
 * PATCH /api/customers/[id]/points
 * Body: { pointsBalance: number, note?: string }
 * Sets the customer's points balance and records an ADJUST ledger row.
 */
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

  let body: { pointsBalance?: unknown; note?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const pointsBalance = Number(body.pointsBalance);
  if (!Number.isInteger(pointsBalance) || pointsBalance < 0) {
    return NextResponse.json(
      { error: "pointsBalance must be a whole number of 0 or more" },
      { status: 400 },
    );
  }

  const note =
    body.note != null && String(body.note).trim()
      ? String(body.note).trim().slice(0, 300)
      : null;

  const existing = await prisma.customer.findUnique({
    where: { id },
    select: { id: true, pointsBalance: true, name: true, phone: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const delta = pointsBalance - existing.pointsBalance;

  const customer = await prisma.$transaction(async (tx) => {
    const updated = await tx.customer.update({
      where: { id },
      data: { pointsBalance },
      select: {
        id: true,
        name: true,
        phone: true,
        pointsBalance: true,
        createdAt: true,
        _count: { select: { orders: true } },
      },
    });

    if (delta !== 0) {
      await tx.pointsTransaction.create({
        data: {
          customerId: id,
          points: delta,
          type: "ADJUST",
          description:
            note ??
            `Admin set balance from ${existing.pointsBalance} to ${pointsBalance}`,
        },
      });
    }

    return updated;
  });

  return NextResponse.json({
    ok: true,
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      pointsBalance: customer.pointsBalance,
      ordersCount: customer._count.orders,
      createdAt: customer.createdAt.toISOString(),
    },
  });
}
