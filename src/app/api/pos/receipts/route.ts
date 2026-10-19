import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canUsePos } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/pos/receipts?code=POS-1001
 * Resolve a printed cashier ticket so /pos can load it into return mode.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canUsePos(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const code = new URL(request.url).searchParams.get("code")?.trim() ?? "";
  if (!code || code.length > 40) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  const upper = code.toUpperCase();
  const body = upper.replace(/^POS-/, "").replace(/^WC-/, "");
  const include = {
    lines: {
      orderBy: { id: "asc" as const },
      include: { product: { select: { nameZh: true, sku: true } } },
    },
  };

  const wooId =
    /^\d+$/.test(body) && body.length <= 10 ? Number(body) : null;

  let sale = await prisma.sale.findFirst({
    where: {
      isReturn: false,
      OR: [
        { orderNumber: upper },
        ...(wooId != null && wooId > 0 ? [{ wooOrderId: wooId }] : []),
      ],
    },
    include,
  });

  if (!sale && /[A-F]/.test(body) && /^[0-9A-F]{8,12}$/.test(body)) {
    const prefix = body.slice(0, 8).toLowerCase();
    const candidates = await prisma.sale.findMany({
      where: {
        isReturn: false,
        OR: [
          { localId: { startsWith: prefix } },
          { id: { startsWith: prefix } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 8,
      include,
    });
    sale =
      candidates.find((row) => {
        const compact = (row.localId || row.id).replace(/-/g, "").toUpperCase();
        return compact.startsWith(body);
      }) ?? null;
  }

  if (!sale) {
    return NextResponse.json({ found: false });
  }

  return NextResponse.json({
    found: true,
    code: sale.orderNumber || upper,
    lines: sale.lines.map((line) => ({
      name: line.name,
      nameZh: line.product?.nameZh ?? null,
      sku: line.product?.sku ?? "",
      qty: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
      wcProductId: line.wcProductId,
    })),
  });
}
