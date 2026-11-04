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
import { getLoyaltySettings } from "@/lib/loyalty/settings";
import type { PaymentMethod } from "@/types/woocommerce";
import {
  mobilePosError,
  mobilePosJson,
  mobilePosOptions,
} from "@/lib/pos/mobilePosCors";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return mobilePosOptions();
}

/** Map mobile UpperCase (and aliases) → stored Sale.paymentMethod lowercase. */
function normalizePaymentMethod(raw: unknown): PaymentMethod {
  const upper = String(raw ?? "CASH")
    .trim()
    .toUpperCase();
  switch (upper) {
    case "CASH":
      return "cash";
    case "CARD":
    case "VISA":
      return "visa";
    case "WALLET":
      return "wallet";
    case "INSTAPAY":
      return "instapay";
    case "WECHAT":
      return "wechat";
    default: {
      const lower = upper.toLowerCase();
      if (
        lower === "cash" ||
        lower === "visa" ||
        lower === "wallet" ||
        lower === "instapay" ||
        lower === "wechat"
      ) {
        return lower as PaymentMethod;
      }
      return "cash";
    }
  }
}

function paymentMethodLabelUpper(method: PaymentMethod): string {
  if (method === "visa") return "VISA";
  return method.toUpperCase();
}

/**
 * POST /api/mobile-pos/direct-checkout
 * Full sale from the mobile cashier (auto-opens shift if needed).
 */
export async function POST(request: Request) {
  try {
    const user = await requireMobilePos(request);
    if (!user) {
      return mobilePosError("غير مصرح — يرجى تسجيل الدخول مجدداً", 401);
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
    } catch (error) {
      console.error("[api/mobile-pos/direct-checkout] bad json", error);
      return mobilePosError("جسم الطلب غير صالح (JSON)", 400);
    }

    const items = (Array.isArray(body.items) ? body.items : [])
      .map((row) => normalizeQueueItem(row))
      .filter((row): row is QueueTicketItem => row != null);

    if (items.length === 0) {
      return mobilePosError(
        "يجب إضافة صنف واحد على الأقل (تحقق من productId/id والكمية والسعر)",
        400,
      );
    }

    const paymentMethod = normalizePaymentMethod(body.paymentMethod);
    const { subtotal } = summarizeQueueItems(items);
    const loyalty = await getLoyaltySettings();
    const requestedRedeem = Math.max(
      0,
      Math.floor(Number(body.pointsRedeemed) || 0),
    );
    const customerId = String(body.customerId ?? "").trim() || null;
    const customerPhone = normalizeLoyaltyPhone(
      String(body.customerPhone ?? ""),
    );
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
      const maxByTotal = Math.floor(subtotal) * loyalty.pointsRedeemValue;
      pointsRedeemed = Math.min(requestedRedeem, maxByBalance, maxByTotal);
      pointsRedeemed =
        Math.floor(pointsRedeemed / loyalty.pointsRedeemValue) *
        loyalty.pointsRedeemValue;
      pointsDiscount = roundMoney(pointsRedeemed / loyalty.pointsRedeemValue);
    }

    const total = Math.max(0, roundMoney(subtotal - pointsDiscount));

    // Cash can overpay (change); digital must settle exact total.
    let paidAmount = roundMoney(
      body.paidAmount != null && body.paidAmount !== ""
        ? Number(body.paidAmount)
        : total,
    );
    if (!Number.isFinite(paidAmount) || paidAmount < 0) {
      paidAmount = total;
    }
    if (paymentMethod !== "cash" && paidAmount < total) {
      paidAmount = total;
    }

    const productKeys = [...new Set(items.map((item) => item.productId))];
    const numericWcIds = productKeys
      .map((key) => Number(key))
      .filter((n) => Number.isFinite(n) && n > 0);

    const products = await prisma.product.findMany({
      where: {
        isDeleted: false,
        OR: [
          { id: { in: productKeys } },
          ...(numericWcIds.length > 0 ? [{ wcId: { in: numericWcIds } }] : []),
        ],
      },
      select: { id: true, wcId: true, name: true, nameZh: true },
    });

    const byPrismaId = new Map(products.map((p) => [p.id, p]));
    const byWcId = new Map(
      products
        .filter((p) => p.wcId != null)
        .map((p) => [String(p.wcId), p]),
    );

    const unresolved: string[] = [];
    const saleLines = items.map((item) => {
      const product =
        byPrismaId.get(item.productId) ?? byWcId.get(item.productId) ?? null;
      if (!product) unresolved.push(item.productId);
      const stockMultiplier = Math.max(
        1,
        Math.floor(Number(item.stockMultiplier) || 1),
      );
      return {
        productId: product?.id ?? null,
        wcProductId: product?.wcId ?? null,
        name: item.name || product?.name || "صنف",
        nameZh: item.nameZh?.trim() || product?.nameZh || null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: roundMoney(item.quantity * item.unitPrice),
        stockMultiplier,
        barcode: item.barcode || "",
      };
    });

    if (unresolved.length > 0) {
      return mobilePosError(
        `تعذر التعرف على بعض الأصناف في قاعدة البيانات: ${unresolved.slice(0, 5).join(", ")}`,
        400,
      );
    }

    const localId =
      body.localId != null && String(body.localId).trim()
        ? String(body.localId).trim()
        : null;

    if (localId) {
      const existing = await prisma.sale.findUnique({ where: { localId } });
      if (existing) {
        return mobilePosJson({
          ok: true,
          alreadySynced: true,
          saleId: existing.id,
          invoiceNumber: existing.orderNumber,
          code: existing.orderNumber,
          orderNumber: existing.orderNumber,
          total: existing.total,
          paidAmount,
          changeAmount: Math.max(0, roundMoney(paidAmount - existing.total)),
          paymentMethod: paymentMethodLabelUpper(paymentMethod),
          cashierName: user.name,
          createdAt: existing.createdAt.toISOString(),
        });
      }
    }

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

    const stockable = saleLines.filter((line) => line.wcProductId != null);
    const stockResult = await applySaleStockChanges({
      lines: stockable.map((line) => ({
        wcProductId: line.wcProductId,
        quantity: line.quantity,
        stockMultiplier: line.stockMultiplier,
      })),
    });

    const missingWc = saleLines.filter((line) => !line.wcProductId);
    if (missingWc.length > 0) {
      stockResult.auditReasons.push(
        `أصناف بدون wcId: ${missingWc.map((l) => l.name).join(", ")}`,
      );
    }

    const saved = await prisma.$transaction(async (tx) => {
      await tx.shift.update({
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
          lines: saleLines.map((line) => ({
            wcProductId: line.wcProductId,
            name: line.name,
            nameZh: line.nameZh,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal: line.lineTotal,
            stockMultiplier: line.stockMultiplier,
          })),
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

      return { sale, customer: updatedLoyalty };
    });

    if (stockResult.wooRows.length > 0) {
      await syncSaleStockRows(stockResult.wooRows);
    }

    const changeAmount = Math.max(0, roundMoney(paidAmount - total));
    const invoiceNumber = saved.sale.orderNumber ?? saved.sale.id;

    return mobilePosJson({
      ok: true,
      saleId: saved.sale.id,
      invoiceNumber,
      code: invoiceNumber,
      orderNumber: invoiceNumber,
      subtotal,
      discount: pointsDiscount,
      total,
      paidAmount,
      changeAmount,
      paymentMethod: paymentMethodLabelUpper(paymentMethod),
      cashierName: user.name,
      createdAt: saved.sale.createdAt.toISOString(),
      items: saleLines.map((line) => ({
        productId: line.productId,
        name: line.name,
        barcode: line.barcode,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
      })),
      pointsEarned: loyaltyCustomer ? pointsEarned : 0,
      pointsRedeemed: loyaltyCustomer ? pointsRedeemed : 0,
      customer: saved.customer,
      requiresAudit: saved.sale.requiresAudit,
      auditReason: saved.sale.auditReason,
    });
  } catch (error) {
    console.error("[api/mobile-pos/direct-checkout]", error);
    const detail =
      error instanceof Error ? error.message : "خطأ غير معروف";
    return mobilePosError(`فشل إتمام البيع: ${detail}`, 500);
  }
}
