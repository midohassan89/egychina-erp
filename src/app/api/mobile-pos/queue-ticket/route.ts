import { prisma } from "@/lib/prisma";
import { requireMobilePos } from "@/lib/pos/mobilePosAuth";
import { normalizeLoyaltyPhone } from "@/lib/pos/loyaltyScan";
import {
  allocateQueueTicketCode,
  isQueueTicketCode,
  normalizeQueueCode,
  normalizeQueueItem,
  serializeQueueTicket,
  summarizeQueueItems,
  type QueueTicketItem,
} from "@/lib/pos/queueTicket";
import {
  mobilePosError,
  mobilePosJson,
  mobilePosOptions,
} from "@/lib/pos/mobilePosCors";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return mobilePosOptions();
}

/**
 * GET /api/mobile-pos/queue-ticket?code=Q-1011
 * Load a queue ticket (with items) into the mobile cashier cart.
 * PENDING tickets become CLAIMED for this cashier.
 */
export async function GET(request: Request) {
  try {
    const user = await requireMobilePos(request);
    if (!user) {
      return mobilePosError("غير مصرح — يرجى تسجيل الدخول مجدداً", 401);
    }

    const url = new URL(request.url);
    const code = normalizeQueueCode(
      url.searchParams.get("code") ??
        url.searchParams.get("ticket") ??
        url.searchParams.get("q") ??
        "",
    );

    if (!code || !isQueueTicketCode(code)) {
      return mobilePosError(
        "كود القسيمة غير صالح (المتوقع مثل Q-1001)",
        400,
      );
    }

    const existing = await prisma.posQueueTicket.findUnique({
      where: { code },
    });

    if (!existing) {
      return mobilePosError("القسيمة غير موجودة", 404);
    }

    if (existing.status === "COMPLETED") {
      return mobilePosError("تم إتمام هذه القسيمة مسبقاً", 409, {
        status: existing.status,
      });
    }
    if (existing.status === "CANCELLED") {
      return mobilePosError("تم إلغاء هذه القسيمة", 409, {
        status: existing.status,
      });
    }

    const ticket =
      existing.status === "PENDING"
        ? await prisma.posQueueTicket.update({
            where: { id: existing.id },
            data: {
              status: "CLAIMED",
              claimedById: user.id,
            },
          })
        : existing;

    const serialized = serializeQueueTicket(ticket);

    return mobilePosJson({
      ok: true,
      ticket: serialized,
      items: serialized.items,
      data: serialized.items,
      code: ticket.code,
      total: ticket.total,
      count: serialized.items.length,
    });
  } catch (error) {
    console.error("[api/mobile-pos/queue-ticket GET]", error);
    return mobilePosError("تعذر جلب قسيمة الانتظار", 500);
  }
}

/**
 * POST /api/mobile-pos/queue-ticket
 * Create a PENDING queue ticket for main-cashier claim (Q-xxxx).
 */
export async function POST(request: Request) {
  try {
    const user = await requireMobilePos(request);
    if (!user) {
      return mobilePosError("غير مصرح — يرجى تسجيل الدخول مجدداً", 401);
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
    } catch (error) {
      console.error("[api/mobile-pos/queue-ticket] bad json", error);
      return mobilePosError("جسم الطلب غير صالح (JSON)", 400);
    }

    let items = (Array.isArray(body.items) ? body.items : [])
      .map((row) => normalizeQueueItem(row))
      .filter((row): row is QueueTicketItem => row != null);

    if (items.length === 0) {
      return mobilePosError(
        "يجب إضافة صنف واحد على الأقل إلى القسيمة (تحقق من productId/id والكمية)",
        400,
      );
    }

    // Fill missing Chinese names from Product / ProductPackage.
    const productIds = [...new Set(items.map((item) => item.productId))];
    const packageIds = [
      ...new Set(
        items
          .map((item) => item.packageId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const [dbProducts, dbPackages] = await Promise.all([
      prisma.product.findMany({
        where: { id: { in: productIds }, isDeleted: false },
        select: {
          id: true,
          name: true,
          nameZh: true,
          barcode: true,
          imageUrl: true,
        },
      }),
      packageIds.length > 0
        ? prisma.productPackage.findMany({
            where: { id: { in: packageIds } },
            select: { id: true, name: true, nameZh: true, barcode: true },
          })
        : Promise.resolve([]),
    ]);
    const productById = new Map(dbProducts.map((p) => [p.id, p]));
    const packageById = new Map(dbPackages.map((p) => [p.id, p]));
    items = items.map((item) => {
      const product = productById.get(item.productId);
      const pkg = item.packageId ? packageById.get(item.packageId) : null;
      return {
        ...item,
        name: item.name || pkg?.name || product?.name || "صنف",
        nameZh:
          item.nameZh?.trim() ||
          pkg?.nameZh?.trim() ||
          product?.nameZh?.trim() ||
          null,
        barcode: item.barcode || pkg?.barcode || product?.barcode || "",
        imageUrl: item.imageUrl || product?.imageUrl || null,
      };
    });

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

    const ticket = await prisma.$transaction(async (tx) => {
      let code = await allocateQueueTicketCode(tx);
      // Never persist empty / placeholder codes.
      if (!code || !/^Q-\d+$/i.test(code) || code.includes("?")) {
        console.error("[api/mobile-pos/queue-ticket] bad allocated code", code);
        code = "Q-1001";
      }

      // Retry once on unique collision by bumping from latest ticket.
      try {
        return await tx.posQueueTicket.create({
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
      } catch (createError) {
        console.error(
          "[api/mobile-pos/queue-ticket] create collision, retrying",
          createError,
        );
        const last = await tx.posQueueTicket.findFirst({
          where: { code: { startsWith: "Q-" } },
          orderBy: { createdAt: "desc" },
          select: { code: true },
        });
        const match = last?.code ? /^Q-(\d+)$/i.exec(last.code) : null;
        const next =
          match && Number.isFinite(parseInt(match[1]!, 10))
            ? parseInt(match[1]!, 10) + 1
            : 1001;
        const retryCode = `Q-${next}`;
        return tx.posQueueTicket.create({
          data: {
            code: retryCode,
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
      }
    });

    if (!ticket.code || !/^Q-\d+$/i.test(ticket.code)) {
      console.error(
        "[api/mobile-pos/queue-ticket] ticket saved without valid code",
        ticket.id,
        ticket.code,
      );
      return mobilePosError(
        "تم حفظ القسيمة لكن كودها غير صالح — راجع السجلات",
        500,
      );
    }

    const serialized = serializeQueueTicket(ticket);

    return mobilePosJson({
      ok: true,
      id: ticket.id,
      code: ticket.code,
      total: ticket.total,
      itemsCount: items.length,
      createdAt: ticket.createdAt.toISOString(),
      ticket: serialized,
    });
  } catch (error) {
    console.error("[api/mobile-pos/queue-ticket]", error);
    const detail =
      error instanceof Error ? error.message : "خطأ غير معروف";
    return mobilePosError(
      `تعذر إنشاء قسيمة الانتظار: ${detail}`,
      500,
    );
  }
}
