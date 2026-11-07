import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canUsePos } from "@/lib/auth/roles";
import { resolvePosAccess } from "@/lib/pos/deviceAuth";
import {
  isQueueTicketCode,
  normalizeQueueCode,
  serializeQueueTicket,
} from "@/lib/pos/queueTicket";

type RouteContext = { params: Promise<{ code: string }> };

/**
 * GET /api/pos/queue-tickets/[code]
 * Claim a PENDING ticket (or return CLAIMED) and load items into the main POS.
 * Auth: staff session or enrolled desktop device Bearer.
 */
export async function GET(request: Request, context: RouteContext) {
  const access = await resolvePosAccess(request);
  if (!access?.userId || !canUsePos(access.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { code: raw } = await context.params;
  const code = normalizeQueueCode(raw);
  if (!isQueueTicketCode(code)) {
    return NextResponse.json(
      {
        ok: false,
        error: "كود القسيمة غير صالح (المتوقع مثل Q-1001)",
        message: "كود القسيمة غير صالح (المتوقع مثل Q-1001)",
      },
      { status: 400 },
    );
  }

  try {
    const existing = await prisma.posQueueTicket.findUnique({ where: { code } });
    if (!existing) {
      return NextResponse.json(
        {
          ok: false,
          error: "القسيمة غير موجودة",
          message: "القسيمة غير موجودة",
        },
        { status: 404 },
      );
    }

    if (existing.status === "COMPLETED") {
      return NextResponse.json(
        {
          ok: false,
          error: "تم إتمام هذه القسيمة مسبقاً",
          message: "تم إتمام هذه القسيمة مسبقاً",
          status: existing.status,
        },
        { status: 409 },
      );
    }
    if (existing.status === "CANCELLED") {
      return NextResponse.json(
        {
          ok: false,
          error: "تم إلغاء هذه القسيمة",
          message: "تم إلغاء هذه القسيمة",
          status: existing.status,
        },
        { status: 409 },
      );
    }

    const ticket =
      existing.status === "PENDING"
        ? await prisma.posQueueTicket.update({
            where: { id: existing.id },
            data: {
              status: "CLAIMED",
              claimedById: access.userId,
            },
          })
        : existing;

    return NextResponse.json({
      ok: true,
      ticket: serializeQueueTicket(ticket),
    });
  } catch (error) {
    console.error("[api/pos/queue-tickets GET code]", error);
    return NextResponse.json(
      {
        ok: false,
        error: "تعذر استلام القسيمة",
        message: "تعذر استلام القسيمة",
      },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/pos/queue-tickets/[code]
 * Mark ticket COMPLETED after main-POS checkout (optional saleId).
 * Auth: staff session or enrolled desktop device Bearer.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const access = await resolvePosAccess(request);
  if (!access?.userId || !canUsePos(access.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { code: raw } = await context.params;
  const code = normalizeQueueCode(raw);
  if (!isQueueTicketCode(code)) {
    return NextResponse.json(
      {
        ok: false,
        error: "كود القسيمة غير صالح (المتوقع مثل Q-1001)",
        message: "كود القسيمة غير صالح (المتوقع مثل Q-1001)",
      },
      { status: 400 },
    );
  }

  let body: { status?: unknown; saleId?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const nextStatus = String(body.status ?? "COMPLETED").trim().toUpperCase();
  if (nextStatus !== "COMPLETED" && nextStatus !== "CANCELLED") {
    return NextResponse.json(
      {
        ok: false,
        error: "حالة القسيمة غير مدعومة (COMPLETED أو CANCELLED فقط)",
        message: "حالة القسيمة غير مدعومة (COMPLETED أو CANCELLED فقط)",
      },
      { status: 400 },
    );
  }
  const saleId = String(body.saleId ?? "").trim() || null;

  try {
    const existing = await prisma.posQueueTicket.findUnique({ where: { code } });
    if (!existing) {
      return NextResponse.json(
        {
          ok: false,
          error: "القسيمة غير موجودة",
          message: "القسيمة غير موجودة",
        },
        { status: 404 },
      );
    }
    if (existing.status === "COMPLETED") {
      return NextResponse.json({
        ok: true,
        alreadyCompleted: true,
        ticket: serializeQueueTicket(existing),
      });
    }

    const ticket = await prisma.posQueueTicket.update({
      where: { id: existing.id },
      data: {
        status: nextStatus,
        ...(nextStatus === "COMPLETED"
          ? {
              saleId,
              claimedById: existing.claimedById ?? access.userId,
            }
          : {}),
      },
    });

    return NextResponse.json({
      ok: true,
      ticket: serializeQueueTicket(ticket),
    });
  } catch (error) {
    console.error("[api/pos/queue-tickets PATCH]", error);
    return NextResponse.json(
      {
        ok: false,
        error: "تعذر تحديث حالة القسيمة",
        message: "تعذر تحديث حالة القسيمة",
      },
      { status: 500 },
    );
  }
}
