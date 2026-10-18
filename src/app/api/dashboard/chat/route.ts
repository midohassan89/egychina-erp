import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isManagerOrAdmin } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";
import { translateTrio } from "@/lib/i18n/translateText";

export const dynamic = "force-dynamic";

async function requireManager() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET(request: Request) {
  const denied = await requireManager();
  if (denied) return denied;
  const customerId = new URL(request.url).searchParams.get("customerId")?.trim() ?? "";

  if (!customerId) {
    const rows = await prisma.chatMessage.findMany({
      orderBy: { createdAt: "desc" },
      include: { customer: { select: { id: true, name: true, phone: true } } },
      take: 400,
    });
    const threads = new Map<string, {
      customerId: string;
      name: string | null;
      phone: string;
      lastText: string;
      lastAt: string;
      unread: number;
    }>();
    for (const row of rows) {
      const current = threads.get(row.customerId);
      if (!current) {
        threads.set(row.customerId, {
          customerId: row.customerId,
          name: row.customer.name,
          phone: row.customer.phone,
          lastText: row.textAr || row.originalText,
          lastAt: row.createdAt.toISOString(),
          unread: row.senderRole === "CUSTOMER" && !row.isReadByAdmin ? 1 : 0,
        });
      } else if (row.senderRole === "CUSTOMER" && !row.isReadByAdmin) {
        current.unread += 1;
      }
    }
    const list = [...threads.values()];
    return NextResponse.json({
      ok: true,
      unread: list.reduce((sum, thread) => sum + thread.unread, 0),
      threads: list,
    });
  }

  await prisma.chatMessage.updateMany({
    where: { customerId, senderRole: "CUSTOMER", isReadByAdmin: false },
    data: { isReadByAdmin: true },
  });
  const messages = await prisma.chatMessage.findMany({
    where: { customerId },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  return NextResponse.json({
    ok: true,
    messages: messages.map((row) => ({
      id: row.id,
      senderRole: row.senderRole,
      originalText: row.originalText,
      originalLang: row.originalLang,
      textAr: row.textAr,
      textEn: row.textEn,
      textZh: row.textZh,
      createdAt: row.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const denied = await requireManager();
  if (denied) return denied;
  let body: { customerId?: unknown; text?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const customerId = String(body.customerId ?? "").trim();
  const text = String(body.text ?? "").trim();
  if (!customerId || !text) {
    return NextResponse.json({ error: "customerId and text are required" }, { status: 400 });
  }
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, deletedAt: null },
    select: { id: true },
  });
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const translated = await translateTrio(text, "ar");
  const message = await prisma.chatMessage.create({
    data: {
      customerId,
      senderRole: "ADMIN",
      originalText: text,
      originalLang: "ar",
      textAr: translated.textAr || text,
      textEn: translated.textEn,
      textZh: translated.textZh,
      isReadByAdmin: true,
      isReadByCustomer: false,
    },
  });
  return NextResponse.json({ ok: true, message }, { status: 201 });
}
