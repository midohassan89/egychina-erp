import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMobilePos } from "@/lib/pos/mobilePosAuth";
import { normalizeLoyaltyPhone } from "@/lib/pos/loyaltyScan";
import {
  allocateQueueTicketCode,
  normalizeQueueItem,
  serializeQueueTicket,
  summarizeQueueItems,
  type QueueTicketItem,
} from "@/lib/pos/queueTicket";

/**
 * POST /api/mobile-pos/queue-ticket
 * Create a PENDING queue ticket for main-cashier claim (Q-xxxx).
 */
export async function POST(request: Request) {
  const user = await requireMobilePos(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    items?: unknown;
    customerPhone?: unknown;
    customerName?: unknown;
    customerId?: unknown;
    notes?: unknown;
    discount?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const items = (Array.isArray(body.items) ? body.items : [])
    .map((row) => normalizeQueueItem(row))
    .filter((row): row is QueueTicketItem => row != null);

  if (items.length === 0) {
    return NextResponse.json({ error: "Add at least one item" }, { status: 400 });
  }

  const { subtotal } = summarizeQueueItems(items);
  const discount = Math.max(0, Number(body.discount) || 0);
  const total = Math.max(0, subtotal - discount);

  const customerPhone = normalizeLoyaltyPhone(
    String(body.customerPhone ?? ""),
  );
  const customerName =
    String(body.customerName ?? "").trim().slice(0, 120) || null;
  const customerId = String(body.customerId ?? "").trim() || null;
  const notes = String(body.notes ?? "").trim().slice(0, 500) || null;

  try {
    const ticket = await prisma.$transaction(async (tx) => {
      const code = await allocateQueueTicketCode(tx);
      return tx.posQueueTicket.create({
        data: {
          code,
          status: "PENDING",
          itemsJson: JSON.stringify(items),
          subtotal,
          discount,
          total,
          customerId,
          customerPhone: customerPhone || null,
          customerName,
          notes,
          createdById: user.id,
          createdByName: user.name,
        },
      });
    });

    return NextResponse.json({
      ok: true,
      ticket: serializeQueueTicket(ticket),
    });
  } catch (error) {
    console.error("[api/mobile-pos/queue-ticket]", error);
    return NextResponse.json(
      { error: "Could not create queue ticket" },
      { status: 500 },
    );
  }
}
