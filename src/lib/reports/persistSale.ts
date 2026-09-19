import { prisma } from "@/lib/prisma";
import { roundMoney } from "@/lib/pos/money";
import { resolveProductUnitCost } from "@/lib/inventory/resolveUnitCost";
import type { PaymentMethod } from "@/types/woocommerce";

export interface PersistSaleLineInput {
  /** WooCommerce product id (POS cart uses wcId as product.id). */
  wcProductId?: number | null;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface PersistSaleInput {
  localId?: string | null;
  shiftId?: number | null;
  userId?: string | null;
  total: number;
  paymentMethod: PaymentMethod | string;
  isReturn?: boolean;
  wooOrderId?: number | null;
  customerName?: string | null;
  createdAt?: string | Date | null;
  lines: PersistSaleLineInput[];
}

/**
 * Persist a completed POS sale/return for reporting (idempotent on localId).
 */
export async function persistSaleRecord(input: PersistSaleInput) {
  const localId =
    input.localId != null && String(input.localId).trim()
      ? String(input.localId).trim()
      : null;

  if (localId) {
    const existing = await prisma.sale.findUnique({ where: { localId } });
    if (existing) return existing;
  }

  const isReturn = Boolean(input.isReturn) || input.total < 0;
  const createdAt = input.createdAt ? new Date(input.createdAt) : new Date();

  // Resolve WC ids → Prisma products + unit costs
  const wcIds = [
    ...new Set(
      input.lines
        .map((l) => Number(l.wcProductId))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  ];

  const products =
    wcIds.length > 0
      ? await prisma.product.findMany({
          where: { wcId: { in: wcIds }, isDeleted: false },
          select: { id: true, wcId: true },
        })
      : [];
  const byWcId = new Map(products.map((p) => [p.wcId, p.id]));

  const lineCreates: {
    productId: string | null;
    wcProductId: number | null;
    name: string;
    quantity: number;
    unitPrice: number;
    unitCost: number;
    lineTotal: number;
  }[] = [];

  for (const line of input.lines) {
    const qty = Math.max(1, Math.trunc(Math.abs(Number(line.quantity)) || 0));
    if (qty <= 0) continue;

    const wcProductId =
      line.wcProductId != null && Number(line.wcProductId) > 0
        ? Number(line.wcProductId)
        : null;
    const productId = wcProductId != null ? (byWcId.get(wcProductId) ?? null) : null;

    let unitCost = 0;
    if (productId) {
      unitCost = await resolveProductUnitCost(prisma, productId);
    }

    lineCreates.push({
      productId,
      wcProductId,
      name: String(line.name || "Item").slice(0, 200),
      quantity: qty,
      unitPrice: roundMoney(Math.abs(Number(line.unitPrice) || 0)),
      unitCost,
      lineTotal: roundMoney(Number(line.lineTotal) || 0),
    });
  }

  return prisma.sale.create({
    data: {
      localId,
      shiftId: input.shiftId != null ? Number(input.shiftId) : null,
      userId: input.userId ?? null,
      total: roundMoney(input.total),
      paymentMethod: String(input.paymentMethod || "cash"),
      isReturn,
      status: "completed",
      wooOrderId: input.wooOrderId ?? null,
      customerName: input.customerName ?? null,
      createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
      lines: { create: lineCreates },
    },
    include: { lines: true },
  });
}
