import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isManagerOrAdmin } from "@/lib/auth/roles";
import { logAuditAction } from "@/lib/audit/logAuditAction";

function deny(sessionRole: string | undefined, signedIn: boolean) {
  if (!signedIn) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isManagerOrAdmin(sessionRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/**
 * GET /api/sales/audit — sales saved with requiresAudit (newest first).
 */
export async function GET() {
  const session = await auth();
  const blocked = deny(session?.user?.role, Boolean(session?.user));
  if (blocked) return blocked;

  const sales = await prisma.sale.findMany({
    where: { requiresAudit: true },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      user: { select: { id: true, username: true } },
    },
  });

  return NextResponse.json({
    sales: sales.map((sale) => ({
      id: sale.id,
      localId: sale.localId,
      shiftId: sale.shiftId,
      total: sale.total,
      paymentMethod: sale.paymentMethod,
      isReturn: sale.isReturn,
      customerName: sale.customerName,
      cashierName: sale.user?.username ?? null,
      auditReason: sale.auditReason,
      createdAt: sale.createdAt.toISOString(),
    })),
    count: sales.length,
  });
}

/**
 * POST /api/sales/audit — mark a flagged sale as reviewed.
 * Body: { saleId: string }
 */
export async function POST(request: Request) {
  const session = await auth();
  const blocked = deny(session?.user?.role, Boolean(session?.user));
  if (blocked) return blocked;

  let body: { saleId?: string };
  try {
    body = (await request.json()) as { saleId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const saleId = String(body.saleId ?? "").trim();
  if (!saleId) {
    return NextResponse.json({ error: "saleId is required" }, { status: 400 });
  }

  const existing = await prisma.sale.findUnique({ where: { id: saleId } });
  if (!existing) {
    return NextResponse.json({ error: "Sale not found" }, { status: 404 });
  }
  if (!existing.requiresAudit) {
    return NextResponse.json({ ok: true, alreadyResolved: true, saleId });
  }

  await prisma.sale.update({
    where: { id: saleId },
    data: { requiresAudit: false },
  });

  await logAuditAction(session!.user!.id, "UPDATE", "POS", saleId, {
    action: "resolve_sale_audit",
    auditReason: existing.auditReason,
    shiftId: existing.shiftId,
    total: existing.total,
  });

  return NextResponse.json({ ok: true, saleId });
}
