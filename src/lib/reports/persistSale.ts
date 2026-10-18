import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { roundMoney, roundQty } from "@/lib/pos/money";
import { resolveProductUnitCost } from "@/lib/inventory/resolveUnitCost";
import type { PaymentMethod } from "@/types/woocommerce";
import { allocateOrderNumber } from "@/lib/orders/orderNumber";

type DbClient = Prisma.TransactionClient | typeof prisma;

export interface PersistSaleLineInput {
  /** WooCommerce product id (POS cart uses wcId as product.id). */
  wcProductId?: number | null;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  /** Pieces consumed per sold quantity. Package lines pass pack size. */
  stockMultiplier?: number;
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
  employeeId?: number | null;
  createdAt?: string | Date | null;
  requiresAudit?: boolean;
  auditReason?: string | null;
  lines: PersistSaleLineInput[];
}

/**
 * Persist a completed POS sale/return for reporting (idempotent on localId).
 */
export async function persistSaleRecord(
  input: PersistSaleInput,
  db: DbClient = prisma,
) {
  const localId =
    input.localId != null && String(input.localId).trim()
      ? String(input.localId).trim()
      : null;

  if (localId) {
    const existing = await db.sale.findUnique({
      where: { localId },
      include: { lines: true },
    });
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
      ? await db.product.findMany({
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
    const qty = roundQty(Math.abs(Number(line.quantity) || 0));
    if (qty <= 0) continue;

    const wcProductId =
      line.wcProductId != null && Number(line.wcProductId) > 0
        ? Number(line.wcProductId)
        : null;
    const productId = wcProductId != null ? (byWcId.get(wcProductId) ?? null) : null;

    const stockMultiplier = Math.max(
      1,
      Math.floor(Number(line.stockMultiplier) || 1),
    );
    let unitCost = 0;
    if (productId) {
      unitCost = roundMoney(
        (await resolveProductUnitCost(db, productId)) * stockMultiplier,
      );
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

  const auditReason = input.auditReason?.trim()
    ? input.auditReason.trim().slice(0, 500)
    : null;

  const paymentMethod = String(input.paymentMethod || "cash");
  const orderNumber =
    paymentMethod === "store" ? null : await allocateOrderNumber(db, "POS");

  return db.sale.create({
    data: {
      localId,
      orderNumber,
      shiftId: input.shiftId != null ? Number(input.shiftId) : null,
      userId: input.userId ?? null,
      total: roundMoney(input.total),
      paymentMethod,
      isReturn,
      status: "completed",
      wooOrderId: input.wooOrderId ?? null,
      customerName: input.customerName ?? null,
      employeeId:
        input.employeeId != null && Number(input.employeeId) > 0
          ? Number(input.employeeId)
          : null,
      requiresAudit: Boolean(input.requiresAudit) || Boolean(auditReason),
      auditReason,
      createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
      lines: { create: lineCreates },
    },
    include: { lines: true },
  });
}
