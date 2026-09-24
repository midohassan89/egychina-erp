import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { mapShiftToCashierShift } from "@/lib/shifts/mapShift";
import { shiftSalesFieldForPayment } from "@/lib/shifts/salesFields";
import { roundMoney } from "@/lib/pos/money";
import { persistSaleRecord } from "@/lib/reports/persistSale";
import {
  applySaleStockChanges,
  SaleStockError,
  syncSaleStockRows,
} from "@/lib/pos/applySaleStock";
import {
  recordStaffMealExpense,
  staffMealExpenseAmount,
} from "@/lib/pos/staffMealExpense";
import { isStaffMealPayment } from "@/lib/pos/paymentMethods";
import type { PaymentMethod } from "@/types/woocommerce";

/**
 * POST /api/checkout
 * Saves the sale even when stock would go negative or no shift is open.
 * Those cases set requiresAudit + auditReason and still return 200.
 * 500 only when the sale row itself cannot be inserted.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    paymentMethod?: PaymentMethod;
    amount?: number;
    isReturn?: boolean;
    shiftId?: string | number | null;
    localId?: string | null;
    total?: number;
    customerName?: string | null;
    employeeId?: number | null;
    createdAt?: string | null;
    wooOrderId?: number | null;
    lines?: {
      productId?: number;
      name?: string;
      qty?: number;
      unitPrice?: number;
      lineTotal?: number;
    }[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const paymentMethod = body.paymentMethod ?? "cash";
  const isStaffMeal = isStaffMealPayment(paymentMethod);
  const salesField = shiftSalesFieldForPayment(paymentMethod);
  const isReturn = Boolean(body.isReturn);

  if (isStaffMeal && isReturn) {
    return NextResponse.json(
      { error: "Staff meals cannot be refunded as cash" },
      { status: 400 },
    );
  }

  const employeeId = Number(body.employeeId);
  let staffEmployee: { id: number; name: string } | null = null;
  if (isStaffMeal) {
    if (!Number.isFinite(employeeId) || employeeId <= 0) {
      return NextResponse.json(
        { error: "Select an employee for the staff meal" },
        { status: 400 },
      );
    }
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, name: true, isActive: true },
    });
    if (!employee || !employee.isActive) {
      return NextResponse.json(
        { error: "Select an active employee" },
        { status: 400 },
      );
    }
    staffEmployee = { id: employee.id, name: employee.name };
  }

  const rawAmount = Number(body.amount ?? body.total);
  if (!isStaffMeal && !Number.isFinite(rawAmount)) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
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

  const shift = shiftIdProvided && !shiftIdValid
    ? null
    : await prisma.shift.findFirst({
        where: {
          userId: session.user.id,
          status: "OPEN",
          ...(shiftIdValid ? { id: shiftIdNum } : {}),
        },
      });

  const saleLines = (body.lines ?? []).map((line) => ({
    wcProductId: line.productId ?? null,
    name: line.name ?? "Item",
    quantity: Math.abs(Number(line.qty) || 0),
    unitPrice: Number(line.unitPrice) || 0,
    lineTotal: Number(line.lineTotal) || 0,
  }));

  const localId =
    body.localId != null && String(body.localId).trim()
      ? String(body.localId).trim()
      : null;

  if (localId) {
    const existing = await prisma.sale.findUnique({ where: { localId } });
    if (existing) {
      return NextResponse.json({
        ok: true,
        alreadySynced: true,
        saleId: existing.id,
        requiresAudit: existing.requiresAudit,
        auditReason: existing.auditReason,
        shift: shift ? mapShiftToCashierShift(shift) : null,
        salesField,
        salesDelta: delta,
        stockUpdated: 0,
        stockWooSynced: 0,
        stockWooError: null,
      });
    }
  }

  const auditReasons: string[] = [];
  if (!shift) {
    auditReasons.push(
      body.shiftId != null && body.shiftId !== ""
        ? "No open shift for this cashier"
        : "Missing shift ID",
    );
  }

  // Stock for sales only — returns use /api/pos/restock (bundle-aware).
  let stockResult: {
    updated: { productId: string; wcId: number; stockQuantity: number }[];
    wooSynced: number;
    wooError: string | null;
    auditReasons: string[];
  } | null = null;

  if (!isReturn && !isStaffMeal && saleLines.length > 0) {
    try {
      stockResult = await applySaleStockChanges({
        lines: saleLines.map((l) => ({
          wcProductId: l.wcProductId,
          quantity: l.quantity,
        })),
        syncAllWooStock: isStaffMeal,
      });
      auditReasons.push(...stockResult.auditReasons);
      if (stockResult.wooError) {
        auditReasons.push(stockResult.wooError);
      }
    } catch (error) {
      const message =
        error instanceof SaleStockError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Stock update failed";
      console.error("[api/checkout] stock", error);
      auditReasons.push(message);
    }
  }

  const auditReason = auditReasons.length
    ? auditReasons.join("; ").slice(0, 500)
    : null;
  const requiresAudit = auditReasons.length > 0;

  let updatedShift = shift;
  let saleId: string | null = null;
  let savedRequiresAudit = requiresAudit;
  let savedAuditReason = auditReason;
  let deferredWoo: { wcId: number; stockQuantity: number }[] = [];
  try {
    const saved = await prisma.$transaction(async (tx) => {
      const reasons = [...auditReasons];
      if (isStaffMeal && !isReturn && saleLines.length > 0) {
        const mealStock = await applySaleStockChanges({
          lines: saleLines.map((l) => ({
            wcProductId: l.wcProductId,
            quantity: l.quantity,
          })),
          syncAllWooStock: true,
          tx,
        });
        stockResult = {
          updated: mealStock.updated,
          wooSynced: 0,
          wooError: null,
          auditReasons: mealStock.auditReasons,
        };
        reasons.push(...mealStock.auditReasons);
        deferredWoo = mealStock.wooRows;
      }

      const mealAudit = reasons.length
        ? reasons.join("; ").slice(0, 500)
        : null;

      if (shift) {
        updatedShift = await tx.shift.update({
          where: { id: shift.id },
          data: {
            ...(salesField ? { [salesField]: { increment: delta } } : {}),
            tickets: { increment: 1 },
          },
        });
      }

      const sale = await persistSaleRecord(
        {
          localId,
          shiftId: shift?.id ?? null,
          userId: session.user.id,
          total: signedTotal,
          paymentMethod,
          isReturn,
          wooOrderId: isStaffMeal ? null : (body.wooOrderId ?? null),
          customerName: body.customerName ?? null,
          employeeId: staffEmployee?.id ?? null,
          createdAt: body.createdAt ?? null,
          requiresAudit: reasons.length > 0,
          auditReason: mealAudit,
          lines: saleLines,
        },
        tx,
      );

      if (isStaffMeal && staffEmployee) {
        const cost = await staffMealExpenseAmount(tx, saleLines);
        await recordStaffMealExpense(tx, {
          saleId: sale.id,
          employeeName: staffEmployee.name,
          amount: cost,
          date: sale.createdAt,
        });
      }

      return sale;
    });
    saleId = saved.id;
    savedRequiresAudit = saved.requiresAudit;
    savedAuditReason = saved.auditReason;

    if (deferredWoo.length > 0) {
      const synced = await syncSaleStockRows(deferredWoo);
      if (stockResult) {
        stockResult.wooSynced = synced.wooSynced;
        stockResult.wooError = synced.wooError;
      }
    }
  } catch (error) {
    console.error("[api/checkout] persist sale", error);
    return NextResponse.json(
      { error: "Could not save sale" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    shift: updatedShift ? mapShiftToCashierShift(updatedShift) : null,
    salesField,
    salesDelta: delta,
    saleId,
    requiresAudit: savedRequiresAudit,
    auditReason: savedAuditReason,
    stockUpdated: stockResult?.updated.length ?? 0,
    stockWooSynced: stockResult?.wooSynced ?? 0,
    stockWooError: stockResult?.wooError ?? null,
  });
}
