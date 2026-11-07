import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { mapShiftToCashierShift } from "@/lib/shifts/mapShift";
import {
  shiftSalesFieldForPayment,
  type ShiftSalesField,
} from "@/lib/shifts/salesFields";
import { roundMoney } from "@/lib/pos/money";
import { persistSaleRecord } from "@/lib/reports/persistSale";
import {
  applySaleStockChanges,
  syncSaleStockRows,
} from "@/lib/pos/applySaleStock";
import {
  recordStaffMealExpense,
  staffMealExpenseAmount,
} from "@/lib/pos/staffMealExpense";
import { isStaffMealPayment } from "@/lib/pos/paymentMethods";
import type { PaymentMethod } from "@/types/woocommerce";

export type CheckoutSaleLineInput = {
  productId?: number | null;
  name?: string;
  nameZh?: string | null;
  qty?: number;
  unitPrice?: number;
  lineTotal?: number;
  stockMultiplier?: number;
};

export type CommitPosCheckoutBody = {
  paymentMethod?: PaymentMethod | string;
  amount?: number;
  isReturn?: boolean;
  shiftId?: string | number | null;
  localId?: string | null;
  total?: number;
  customerName?: string | null;
  employeeId?: number | null;
  customerId?: string | null;
  pointsEarned?: number;
  pointsRedeemed?: number;
  createdAt?: string | null;
  wooOrderId?: number | null;
  lines?: CheckoutSaleLineInput[];
};

export type CommitPosCheckoutResult = {
  ok: true;
  alreadySynced: boolean;
  saleId: string;
  orderNumber: string | null;
  requiresAudit: boolean;
  auditReason: string | null;
  salesField: ShiftSalesField | null;
  salesDelta: number;
  stockUpdated: number;
  stockWooSynced: number;
  stockWooError: string | null;
  shift: ReturnType<typeof mapShiftToCashierShift> | null;
  order: { id: string; pointsEarned: number; pointsRedeemed: number };
  customer: {
    id: string;
    name: string | null;
    phone: string;
    pointsBalance: number;
  } | null;
};

type StaffEmployee = { id: number; name: string };

/**
 * Atomically claim `localId` (sale insert), then apply stock / shift / loyalty
 * in the same Prisma transaction. Concurrent retries with the same `localId`
 * return `alreadySynced` without a second stock movement.
 *
 * WooCommerce HTTP pushes stay after commit (never hold the DB transaction open).
 */
export async function commitPosCheckout(options: {
  userId: string;
  body: CommitPosCheckoutBody;
  staffEmployee?: StaffEmployee | null;
}): Promise<CommitPosCheckoutResult> {
  const body = options.body;
  const paymentMethod = (body.paymentMethod ?? "cash") as PaymentMethod | string;
  const isStaffMeal = isStaffMealPayment(paymentMethod);
  const salesField = shiftSalesFieldForPayment(paymentMethod);
  const isReturn = Boolean(body.isReturn);
  const staffEmployee = options.staffEmployee ?? null;

  const rawAmount = Number(body.amount ?? body.total);
  if (!isStaffMeal && !Number.isFinite(rawAmount)) {
    throw new CommitPosCheckoutError("Invalid amount", 400);
  }

  let delta = isStaffMeal ? 0 : roundMoney(Math.abs(rawAmount));
  if (!isStaffMeal && (isReturn || rawAmount < 0)) {
    delta = -delta;
  }

  const signedTotal = isStaffMeal
    ? 0
    : body.total != null && Number.isFinite(Number(body.total))
      ? roundMoney(Number(body.total))
      : delta;

  const rawShift = body.shiftId;
  const shiftIdNum = Number(rawShift);
  const shiftIdProvided = rawShift != null && String(rawShift) !== "";
  const shiftIdValid =
    shiftIdProvided && Number.isFinite(shiftIdNum) && shiftIdNum > 0;

  const shift =
    shiftIdProvided && !shiftIdValid
      ? null
      : await prisma.shift.findFirst({
          where: {
            userId: options.userId,
            status: "OPEN",
            ...(shiftIdValid ? { id: shiftIdNum } : {}),
          },
        });

  const saleLines = (body.lines ?? []).map((line) => ({
    wcProductId: line.productId ?? null,
    name: line.name ?? "Item",
    nameZh:
      line.nameZh != null && String(line.nameZh).trim()
        ? String(line.nameZh).trim()
        : null,
    quantity: Math.abs(Number(line.qty) || 0),
    unitPrice: Number(line.unitPrice) || 0,
    lineTotal: Number(line.lineTotal) || 0,
    stockMultiplier: Math.max(1, Math.floor(Number(line.stockMultiplier) || 1)),
  }));

  const localId =
    body.localId != null && String(body.localId).trim()
      ? String(body.localId).trim()
      : null;

  // Fast path outside the write lock: sequential retries after a committed sale.
  if (localId) {
    const existing = await prisma.sale.findUnique({ where: { localId } });
    if (existing) {
      return alreadySyncedResult({
        sale: existing,
        shift,
        salesField,
        delta,
        pointsEarned: body.pointsEarned ?? 0,
        pointsRedeemed: body.pointsRedeemed ?? 0,
      });
    }
  }

  const preAudit: string[] = [];
  if (!shift) {
    preAudit.push(
      body.shiftId != null && body.shiftId !== ""
        ? "No open shift for this cashier"
        : "Missing shift ID",
    );
  }

  let deferredWoo: { wcId: number; stockQuantity: number }[] = [];

  try {
    const saved = await prisma.$transaction(async (tx) => {
      // Re-check under the transaction before claiming / mutating stock.
      if (localId) {
        const existing = await tx.sale.findUnique({
          where: { localId },
          include: { lines: true },
        });
        if (existing) {
          return {
            alreadySynced: true as const,
            sale: existing,
            customer: null,
            updatedShift: shift,
            stockUpdated: 0,
            stockWooError: null as string | null,
            auditReasons: [] as string[],
          };
        }
      }

      const reasons = [...preAudit];

      // Claim localId first so a concurrent twin fails unique before stock moves.
      const persisted = await persistSaleRecord(
        {
          localId,
          shiftId: shift?.id ?? null,
          userId: options.userId,
          total: signedTotal,
          paymentMethod,
          isReturn,
          wooOrderId: isStaffMeal ? null : (body.wooOrderId ?? null),
          customerName: body.customerName ?? null,
          employeeId: staffEmployee?.id ?? null,
          createdAt: body.createdAt ?? null,
          requiresAudit: reasons.length > 0,
          auditReason: reasons.length
            ? reasons.join("; ").slice(0, 500)
            : null,
          lines: saleLines,
        },
        tx,
      );

      if (!persisted.created) {
        return {
          alreadySynced: true as const,
          sale: persisted.sale,
          customer: null,
          updatedShift: shift,
          stockUpdated: 0,
          stockWooError: null as string | null,
          auditReasons: [] as string[],
        };
      }

      let stockUpdated = 0;
      let stockWooError: string | null = null;

      if (!isReturn && saleLines.length > 0) {
        const stock = await applySaleStockChanges({
          lines: saleLines.map((l) => ({
            wcProductId: l.wcProductId,
            quantity: l.quantity,
            stockMultiplier: l.stockMultiplier,
          })),
          syncAllWooStock: isStaffMeal,
          tx,
        });
        reasons.push(...stock.auditReasons);
        stockUpdated = stock.updated.length;
        stockWooError = stock.wooError;
        deferredWoo = stock.wooRows;
      }

      let updatedShift = shift;
      if (shift) {
        updatedShift = await tx.shift.update({
          where: { id: shift.id },
          data: {
            ...(salesField ? { [salesField]: { increment: delta } } : {}),
            tickets: { increment: 1 },
          },
        });
      }

      const loyaltyId = String(body.customerId ?? "").trim();
      const pointsEarned = Math.max(0, Math.floor(Number(body.pointsEarned) || 0));
      const pointsRedeemed = Math.max(
        0,
        Math.floor(Number(body.pointsRedeemed) || 0),
      );
      let updatedLoyalty: {
        id: string;
        name: string | null;
        phone: string;
        pointsBalance: number;
      } | null = null;

      if (loyaltyId && !isReturn && !isStaffMeal) {
        const loyaltyCustomer = await tx.customer.findUnique({
          where: { id: loyaltyId },
          select: { id: true, name: true, phone: true, pointsBalance: true },
        });
        if (loyaltyCustomer && (pointsEarned > 0 || pointsRedeemed > 0)) {
          const nextBalance =
            loyaltyCustomer.pointsBalance + pointsEarned - pointsRedeemed;
          if (nextBalance >= 0) {
            updatedLoyalty = await tx.customer.update({
              where: { id: loyaltyCustomer.id },
              data: { pointsBalance: nextBalance },
              select: {
                id: true,
                name: true,
                phone: true,
                pointsBalance: true,
              },
            });
            if (pointsEarned > 0) {
              await tx.pointsTransaction.create({
                data: {
                  customerId: loyaltyCustomer.id,
                  points: pointsEarned,
                  type: "EARN",
                  description: `POS sale ${persisted.sale.id}`,
                },
              });
            }
            if (pointsRedeemed > 0) {
              await tx.pointsTransaction.create({
                data: {
                  customerId: loyaltyCustomer.id,
                  points: -pointsRedeemed,
                  type: "REDEEM",
                  description: `POS sale ${persisted.sale.id}`,
                },
              });
            }
          }
        } else if (loyaltyCustomer) {
          updatedLoyalty = loyaltyCustomer;
        }
      }

      if (isStaffMeal && staffEmployee) {
        const cost = await staffMealExpenseAmount(tx, saleLines);
        await recordStaffMealExpense(tx, {
          saleId: persisted.sale.id,
          employeeName: staffEmployee.name,
          amount: cost,
          date: persisted.sale.createdAt,
        });
      }

      const mealAudit = reasons.length
        ? reasons.join("; ").slice(0, 500)
        : null;
      let sale = persisted.sale;
      if (
        mealAudit &&
        (sale.auditReason !== mealAudit || !sale.requiresAudit)
      ) {
        sale = await tx.sale.update({
          where: { id: sale.id },
          data: {
            requiresAudit: true,
            auditReason: mealAudit,
          },
          include: { lines: true },
        });
      }

      return {
        alreadySynced: false as const,
        sale,
        customer: updatedLoyalty,
        updatedShift,
        stockUpdated,
        stockWooError,
        auditReasons: reasons,
      };
    });

    let stockWooSynced = 0;
    let stockWooError = saved.stockWooError;
    if (!saved.alreadySynced && deferredWoo.length > 0) {
      const synced = await syncSaleStockRows(deferredWoo);
      stockWooSynced = synced.wooSynced;
      stockWooError = synced.wooError ?? stockWooError;
    }

    if (saved.alreadySynced) {
      return alreadySyncedResult({
        sale: saved.sale,
        shift: saved.updatedShift,
        salesField,
        delta,
        pointsEarned: body.pointsEarned ?? 0,
        pointsRedeemed: body.pointsRedeemed ?? 0,
      });
    }

    return {
      ok: true,
      alreadySynced: false,
      saleId: saved.sale.id,
      orderNumber: saved.sale.orderNumber ?? null,
      requiresAudit: saved.sale.requiresAudit,
      auditReason: saved.sale.auditReason,
      salesField,
      salesDelta: delta,
      stockUpdated: saved.stockUpdated,
      stockWooSynced,
      stockWooError,
      shift: saved.updatedShift
        ? mapShiftToCashierShift(saved.updatedShift)
        : null,
      order: {
        id: saved.sale.id,
        pointsEarned: body.pointsEarned ?? 0,
        pointsRedeemed: body.pointsRedeemed ?? 0,
      },
      customer: saved.customer,
    };
  } catch (error) {
    console.error("[commitPosCheckout]", error);
    throw new CommitPosCheckoutError("Could not save sale", 500);
  }
}

export class CommitPosCheckoutError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "CommitPosCheckoutError";
  }
}

function alreadySyncedResult(options: {
  sale: {
    id: string;
    orderNumber?: string | null;
    requiresAudit: boolean;
    auditReason: string | null;
  };
  shift: Prisma.ShiftGetPayload<object> | null;
  salesField: ShiftSalesField | null;
  delta: number;
  pointsEarned: number;
  pointsRedeemed: number;
}): CommitPosCheckoutResult {
  return {
    ok: true,
    alreadySynced: true,
    saleId: options.sale.id,
    orderNumber: options.sale.orderNumber ?? null,
    requiresAudit: options.sale.requiresAudit,
    auditReason: options.sale.auditReason,
    salesField: options.salesField,
    salesDelta: options.delta,
    stockUpdated: 0,
    stockWooSynced: 0,
    stockWooError: null,
    shift: options.shift ? mapShiftToCashierShift(options.shift) : null,
    order: {
      id: options.sale.id,
      pointsEarned: options.pointsEarned,
      pointsRedeemed: options.pointsRedeemed,
    },
    customer: null,
  };
}
