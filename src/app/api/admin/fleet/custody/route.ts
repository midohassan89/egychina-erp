import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isManagerOrAdmin } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";
import { ensureTreasury, roundMoney } from "@/lib/treasury/ensureTreasury";

function startOfToday() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
}

/** GET /api/admin/fleet/custody — today's assigned orders and unsettled cash. */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isManagerOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const start = startOfToday();
  const [drivers, orders] = await Promise.all([
    prisma.user.findMany({
      where: { role: "DRIVER", status: "ACTIVE" },
      select: { id: true, username: true },
      orderBy: { username: "asc" },
    }),
    prisma.order.findMany({
      where: {
        assignedDriverId: { not: null },
        createdAt: { gte: start },
        status: { notIn: ["CANCELLED", "RETURNED"] },
      },
      select: {
        id: true,
        assignedDriverId: true,
        totalAmount: true,
        codSettledAt: true,
      },
    }),
  ]);

  return NextResponse.json({
    drivers: drivers.map((driver) => {
      const rows = orders.filter((order) => order.assignedDriverId === driver.id);
      const open = rows.filter((order) => order.codSettledAt == null);
      return {
        id: driver.id,
        name: driver.username,
        ordersToday: rows.length,
        cashToCollect: roundMoney(open.reduce((sum, order) => sum + order.totalAmount, 0)),
      };
    }),
  });
}

/** POST /api/admin/fleet/custody — deposit a driver's open cash into the treasury. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isManagerOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let driverId = "";
  try {
    const body = (await request.json()) as { driverId?: unknown };
    driverId = String(body.driverId ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!driverId) {
    return NextResponse.json({ error: "اختر السائق" }, { status: 400 });
  }

  const start = startOfToday();
  const orders = await prisma.order.findMany({
    where: {
      assignedDriverId: driverId,
      createdAt: { gte: start },
      codSettledAt: null,
      status: { notIn: ["CANCELLED", "RETURNED"] },
    },
    select: { id: true, totalAmount: true },
  });
  const amount = roundMoney(orders.reduce((sum, order) => sum + order.totalAmount, 0));
  if (amount <= 0) {
    return NextResponse.json({ error: "لا توجد عهدة لتحصيلها" }, { status: 400 });
  }

  const driver = await prisma.user.findUnique({
    where: { id: driverId },
    select: { username: true },
  });

  await prisma.$transaction(async (tx) => {
    const treasury = await ensureTreasury(tx);
    await tx.treasuryTransaction.create({
      data: {
        type: "IN",
        amount,
        description: `تصفية عهدة السائق ${driver?.username ?? driverId}`,
        reference: "DRIVER_COD",
      },
    });
    await tx.treasury.update({
      where: { id: treasury.id },
      data: { balance: { increment: amount } },
    });
    await tx.order.updateMany({
      where: { id: { in: orders.map((order) => order.id) } },
      data: { codSettledAt: new Date() },
    });
  });

  return NextResponse.json({ ok: true, amount, orders: orders.length });
}
