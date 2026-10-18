import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isManagerOrAdmin } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";
import { translateTrio } from "@/lib/i18n/translateText";
import { pushToCustomer } from "@/lib/notifications/pushCustomer";

export const dynamic = "force-dynamic";

async function requireManager() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const denied = await requireManager();
  if (denied) return denied;
  const notifications = await prisma.customerNotification.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { customer: { select: { id: true, name: true, phone: true } } },
  });
  return NextResponse.json({
    ok: true,
    notifications: notifications.map((row) => ({
      id: row.id,
      titleAr: row.titleAr,
      titleEn: row.titleEn,
      titleZh: row.titleZh,
      bodyAr: row.bodyAr,
      type: row.type,
      customer: row.customer,
      createdAt: row.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const denied = await requireManager();
  if (denied) return denied;

  let body: {
    titleAr?: unknown;
    bodyAr?: unknown;
    titleEn?: unknown;
    titleZh?: unknown;
    bodyEn?: unknown;
    bodyZh?: unknown;
    customerId?: unknown;
    phone?: unknown;
    all?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const titleAr = String(body.titleAr ?? "").trim();
  const bodyAr = String(body.bodyAr ?? "").trim();
  if (!titleAr || !bodyAr) {
    return NextResponse.json({ error: "Arabic title and body are required" }, { status: 400 });
  }

  const [title, text] = await Promise.all([
    translateTrio(titleAr, "ar"),
    translateTrio(bodyAr, "ar"),
  ]);
  const copy = {
    titleAr,
    titleEn: String(body.titleEn ?? "").trim() || title.textEn,
    titleZh: String(body.titleZh ?? "").trim() || title.textZh,
    bodyAr,
    bodyEn: String(body.bodyEn ?? "").trim() || text.textEn,
    bodyZh: String(body.bodyZh ?? "").trim() || text.textZh,
    type: "BROADCAST",
  };

  const sendAll = body.all === true || (!body.customerId && !body.phone);
  const customers = sendAll
    ? await prisma.customer.findMany({
        where: { deletedAt: null },
        select: { id: true, expoPushToken: true, pushToken: true },
      })
    : await prisma.customer.findMany({
        where: {
          deletedAt: null,
          OR: [
            ...(String(body.customerId ?? "").trim()
              ? [{ id: String(body.customerId).trim() }]
              : []),
            ...(String(body.phone ?? "").trim()
              ? [{ phone: { contains: String(body.phone).replace(/\D/g, "").slice(-10) } }]
              : []),
          ],
        },
        select: { id: true, expoPushToken: true, pushToken: true },
        take: 5,
      });

  if (!sendAll && customers.length === 0) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  if (customers.length > 0) {
    await prisma.customerNotification.createMany({
      data: customers.map((customer) => ({
        customerId: customer.id,
        ...copy,
      })),
    });
    await Promise.allSettled(
      customers.map((customer) =>
        pushToCustomer(customer, copy.titleAr, copy.bodyAr, { type: "broadcast" }),
      ),
    );
  }

  return NextResponse.json({ ok: true, sent: customers.length });
}
