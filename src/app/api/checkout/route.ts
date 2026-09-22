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
} from "@/lib/pos/applySaleStock";
import type { PaymentMethod } from "@/types/woocommerce";

/**
 * POST /api/checkout
 * 1. Update open shift payment bucket + tickets
 * 2. Persist Sale + SaleLine for Reports (P&L / bestsellers)
 * 3. Deduct local stock (bundles → linked base unit × multiplier)
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
  const salesField = shiftSalesFieldForPayment(paymentMethod);
  const isReturn = Boolean(body.isReturn);

  const rawAmount = Number(body.amount ?? body.total);
  if (!Number.isFinite(rawAmount)) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  let delta = roundMoney(Math.abs(rawAmount));
  if (isReturn || rawAmount < 0) {
    delta = -delta;
  }

  const signedTotal =
    body.total != null && Number.isFinite(Number(body.total))
      ? roundMoney(Number(body.total))
      : delta;

  const shift = await prisma.shift.findFirst({
    where: {
      userId: session.user.id,
      status: "OPEN",
      ...(body.shiftId != null && body.shiftId !== ""
        ? { id: Number(body.shiftId) }
        : {}),
    },
  });

  if (!shift) {
    return NextResponse.json(
      { error: "No open shift — cannot record sale" },
      { status: 409 },
    );
  }

  const saleLines = (body.lines ?? []).map((line) => ({
    wcProductId: line.productId ?? null,
    name: line.name ?? "Item",
    quantity: Math.abs(Number(line.qty) || 0),
    unitPrice: Number(line.unitPrice) || 0,
    lineTotal: Number(line.lineTotal) || 0,
  }));

  // Stock for sales only — returns use /api/pos/restock (bundle-aware).
  let stockResult: {
    updated: { productId: string; wcId: number; stockQuantity: number }[];
    wooSynced: number;
    wooError: string | null;
  } | null = null;

  if (!isReturn && saleLines.length > 0) {
    try {
      stockResult = await applySaleStockChanges({
        lines: saleLines.map((l) => ({
          wcProductId: l.wcProductId,
          quantity: l.quantity,
        })),
      });
    } catch (error) {
      if (error instanceof SaleStockError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.statusCode },
        );
      }
      console.error("[api/checkout] stock", error);
      return NextResponse.json(
        { error: "Stock update failed" },
        { status: 500 },
      );
    }
  }

  const updated = await prisma.shift.update({
    where: { id: shift.id },
    data: {
      [salesField]: { increment: delta },
      tickets: { increment: 1 },
    },
  });

  let saleId: string | null = null;
  try {
    const sale = await persistSaleRecord({
      localId: body.localId,
      shiftId: shift.id,
      userId: session.user.id,
      total: signedTotal,
      paymentMethod,
      isReturn,
      wooOrderId: body.wooOrderId ?? null,
      customerName: body.customerName ?? null,
      createdAt: body.createdAt ?? null,
      lines: saleLines,
    });
    saleId = sale.id;
  } catch (error) {
    console.error("[api/checkout] persist sale", error);
  }

  return NextResponse.json({
    ok: true,
    shift: mapShiftToCashierShift(updated),
    salesField,
    salesDelta: delta,
    saleId,
    stockUpdated: stockResult?.updated.length ?? 0,
    stockWooSynced: stockResult?.wooSynced ?? 0,
    stockWooError: stockResult?.wooError ?? null,
  });
}
