import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMobilePos } from "@/lib/pos/mobilePosAuth";
import { normalizeLoyaltyPhone } from "@/lib/pos/loyaltyScan";
import { roundMoney } from "@/lib/pos/money";
import {
  normalizeQueueItem,
  summarizeQueueItems,
  type QueueTicketItem,
} from "@/lib/pos/queueTicket";
import { persistSaleRecord } from "@/lib/reports/persistSale";
import {
  applySaleStockChanges,
  syncSaleStockRows,
} from "@/lib/pos/applySaleStock";
import { shiftSalesFieldForPayment } from "@/lib/shifts/salesFields";
import { mapShiftToCashierShift } from "@/lib/shifts/mapShift";
import { getLoyaltySettings } from "@/lib/loyalty/settings";
import type { PaymentMethod } from "@/types/woocommerce";

const ALLOWED_PAYMENTS = new Set([
  "cash",
  "visa",
  "wallet",
  "instapay",
  "wechat",
]);

/**
 * POST /api/mobile-pos/direct-checkout
 * Full sale from the mobile queue-buster (auto-opens shift if needed).
 */
export async function POST(request: Request) {
  const user = await requireMobilePos(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    items?: unknown;
    paymentMethod?: unknown;
    paidAmount?: unknown;
    customerPhone?: unknown;
    customerName?: unknown;
    customerId?: unknown;
    pointsRedeemed?: unknown;
    localId?: unknown;
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

  const paymentMethod = String(body.paymentMethod ?? "cash").trim() as PaymentMethod;
  if (!ALLOWED_PAYMENTS.has(paymentMethod)) {
    return NextResponse.json({ error: "Unsupported payment method" }, { status: 400 });
  }

  const { subtotal } = summarizeQueueItems(items);
  const loyalty = await getLoyaltySettings();
  const requestedRedeem = Math.max(
    0,
    Math.floor(Number(body.pointsRedeemed) || 0),
  );
  const customerId = String(body.customerId ?? "").trim() || null;
  const customerPhone = normalizeLoyaltyPhone(String(body.customerPhone ?? ""));
  const customerName =
    String(body.customerName ?? "").trim().slice(0, 120) || null;

  let pointsRedeemed = 0;
  let pointsDiscount = 0;
  let loyaltyCustomer: {
    id: string;
    name: string | null;
    phone: string;
    pointsBalance: number;
  } | null = null;

  if (customerId || customerPhone) {
    loyaltyCustomer = await prisma.customer.findFirst({
      where: {
        deletedAt: null,
        ...(customerId ? { id: customerId } : { phone: customerPhone }),
      },
      select: { id: true, name: true, phone: true, pointsBalance: true },
    });
  }

  if (loyaltyCustomer && requestedRedeem > 0) {
    const maxByBalance =
      Math.floor(loyaltyCustomer.pointsBalance / loyalty.pointsRedeemValue) *
      loyalty.pointsRedeemValue;
    const maxByTotal =
      Math.floor(subtotal) * loyalty.pointsRedeemValue;
    pointsRedeemed = Math.min(requestedRedeem, maxByBalance, maxByTotal);
    // Align to redeem value steps (POS uses 1000 pts = 1 EGP typically).
    pointsRedeemed =
      Math.floor(pointsRedeemed / loyalty.pointsRedeemValue) *
      loyalty.pointsRedeemValue;
    pointsDiscount = roundMoney(pointsRedeemed / loyalty.pointsRedeemValue);
  }

  const total = Math.max(0, roundMoney(subtotal - pointsDiscount));
  const paidAmount = roundMoney(
    Number(body.paidAmount ?? total),
  );
  if (!Number.isFinite(paidAmount) || paidAmount < 0) {
    return NextResponse.json({ error: "Invalid paidAmount" }, { status: 400 });
  }

  const productIds = [...new Set(items.map((item) => item.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, isDeleted: false },
    select: { id: true, wcId: true, name: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  const saleLines = items.map((item) => {
    const product = byId.get(item.productId);
    const stockMultiplier = Math.max(
      1,
      Math.floor(Number(item.stockMultiplier) || 1),
    );
    return {
      wcProductId: product?.wcId ?? null,
      name: item.name || product?.name || "Item",
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: roundMoney(item.quantity * item.unitPrice),
      stockMultiplier,
    };
  });

  if (saleLines.some((line) => !line.wcProductId)) {
    return NextResponse.json(
      { error: "One or more products could not be resolved" },
      { status: 400 },
    );
  }

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
        orderNumber: existing.orderNumber,
      });
    }
  }

  try {
    let shift = await prisma.shift.findFirst({
      where: { userId: user.id, status: "OPEN" },
    });
    if (!shift) {
      shift = await prisma.shift.create({
        data: {
          userId: user.id,
          startingCash: 0,
          cashSales: 0,
          visaSales: 0,
          walletSales: 0,
          instapaySales: 0,
          wechatSales: 0,
          tickets: 0,
          status: "OPEN",
        },
      });
    }

    const salesField = shiftSalesFieldForPayment(paymentMethod);
    const pointsEarned = Math.floor(total * loyalty.pointsEarnRatio);

    const stockResult = await applySaleStockChanges({
      lines: saleLines.map((line) => ({
        wcProductId: line.wcProductId,
        quantity: line.quantity,
        stockMultiplier: line.stockMultiplier,
      })),
    });

    const saved = await prisma.$transaction(async (tx) => {
      const updatedShift = await tx.shift.update({
        where: { id: shift!.id },
        data: {
          ...(salesField ? { [salesField]: { increment: total } } : {}),
          tickets: { increment: 1 },
        },
      });

      const sale = await persistSaleRecord(
        {
          localId,
          shiftId: shift!.id,
          userId: user.id,
          total,
          paymentMethod,
          isReturn: false,
          customerName:
            customerName ||
            loyaltyCustomer?.name ||
            loyaltyCustomer?.phone ||
            null,
          requiresAudit: stockResult.auditReasons.length > 0,
          auditReason: stockResult.auditReasons.length
            ? stockResult.auditReasons.join("; ").slice(0, 500)
            : null,
          lines: saleLines,
        },
        tx,
      );

      let updatedLoyalty = loyaltyCustomer;
      if (loyaltyCustomer && (pointsEarned > 0 || pointsRedeemed > 0)) {
        const nextBalance =
          loyaltyCustomer.pointsBalance + pointsEarned - pointsRedeemed;
        if (nextBalance >= 0) {
          updatedLoyalty = await tx.customer.update({
            where: { id: loyaltyCustomer.id },
            data: { pointsBalance: nextBalance },
            select: { id: true, name: true, phone: true, pointsBalance: true },
          });
          if (pointsEarned > 0) {
            await tx.pointsTransaction.create({
              data: {
                customerId: loyaltyCustomer.id,
                points: pointsEarned,
                type: "EARN",
                description: `Mobile POS ${sale.orderNumber ?? sale.id}`,
              },
            });
          }
          if (pointsRedeemed > 0) {
            await tx.pointsTransaction.create({
              data: {
                customerId: loyaltyCustomer.id,
                points: -pointsRedeemed,
                type: "REDEEM",
                description: `Mobile POS ${sale.orderNumber ?? sale.id}`,
              },
            });
          }
        }
      }

      return { sale, shift: updatedShift, customer: updatedLoyalty };
    });

    if (stockResult.wooRows.length > 0) {
      await syncSaleStockRows(stockResult.wooRows);
    }

    const changeAmount = Math.max(0, roundMoney(paidAmount - total));

    return NextResponse.json({
      ok: true,
      saleId: saved.sale.id,
      orderNumber: saved.sale.orderNumber,
      total,
      subtotal,
      discount: pointsDiscount,
      paidAmount,
      changeAmount,
      pointsEarned: loyaltyCustomer ? pointsEarned : 0,
      pointsRedeemed: loyaltyCustomer ? pointsRedeemed : 0,
      customer: saved.customer,
      shift: mapShiftToCashierShift(saved.shift),
      stockUpdated: stockResult.updated.length,
      requiresAudit: saved.sale.requiresAudit,
      auditReason: saved.sale.auditReason,
    });
  } catch (error) {
    console.error("[api/mobile-pos/direct-checkout]", error);
    return NextResponse.json(
      { error: "Checkout failed" },
      { status: 500 },
    );
  }
}
