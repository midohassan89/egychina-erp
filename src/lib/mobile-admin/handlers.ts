import { prisma } from "@/lib/prisma";
import { roundMoney } from "@/lib/pos/money";
import { createPurchaseInvoice } from "@/lib/purchases/createPurchase";
import { createPurchaseReturn } from "@/lib/purchases/createPurchaseReturn";
import { persistSaleRecord } from "@/lib/reports/persistSale";
import { normalizeOrderStatus } from "@/lib/orders/status";
import { applyOrderStatusLoyalty } from "@/lib/orders/loyalty";
import { debitPaymentSource } from "@/lib/treasury/debitPaymentSource";
import type { MobileAdminUser } from "@/lib/pos/mobileAdminAuth";
import bcrypt from "bcryptjs";

export type ModuleContext = {
  user: MobileAdminUser;
  method: string;
  body: Record<string, unknown>;
  searchParams: URLSearchParams;
  id?: string | null;
};

export type ModuleResult =
  | {
      ok: true;
      status?: number;
      items?: unknown[];
      stats?: Record<string, unknown>;
      data?: Record<string, unknown>;
    }
  | { ok: false; status: number; error: string };

function q(params: URLSearchParams, key: string, fallback = ""): string {
  return String(params.get(key) ?? fallback).trim();
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function okList(
  items: unknown[],
  stats: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
  status = 200,
): ModuleResult {
  return {
    ok: true,
    status,
    items,
    stats: { count: items.length, ...stats },
    data: { ...extra },
  };
}

function okOne(
  payload: Record<string, unknown>,
  status = 200,
): ModuleResult {
  const items = Array.isArray(payload.items)
    ? (payload.items as unknown[])
    : payload.item != null
      ? [payload.item]
      : [];
  const rest = { ...payload };
  delete rest.items;
  delete rest.item;
  const stats = (rest.stats as Record<string, unknown> | undefined) ?? {};
  delete rest.stats;
  return {
    ok: true,
    status,
    items,
    stats,
    data: rest,
  };
}

function mapMobileOrderStatus(raw: string): string | null {
  const upper = raw.trim().toUpperCase();
  const aliases: Record<string, string> = {
    PROCESSING: "PREPARING",
    PREPARING: "PREPARING",
    CONFIRMED: "CONFIRMED",
    PENDING: "PENDING",
    SHIPPED: "SHIPPED",
    DELIVERED: "DELIVERED",
    COMPLETED: "COMPLETED",
    CANCELLED: "CANCELLED",
    CANCELED: "CANCELLED",
  };
  const mapped = aliases[upper] ?? upper;
  return normalizeOrderStatus(mapped);
}

async function ensureDefaultDeliveryZones() {
  const count = await prisma.deliveryZone.count();
  if (count > 0) return;
  await prisma.deliveryZone.createMany({
    data: [
      {
        nameAr: "العبور",
        nameEn: "El Obour",
        nameZh: "欧布尔",
        deliveryFee: 30,
        minOrder: 0,
        estimatedTime: "30 - 45 دقيقة",
        isActive: true,
      },
      {
        nameAr: "القاهرة الكبرى",
        nameEn: "Greater Cairo",
        nameZh: "大开罗",
        deliveryFee: 50,
        minOrder: 0,
        estimatedTime: "45 - 90 دقيقة",
        isActive: true,
      },
      {
        nameAr: "الشروق",
        nameEn: "El Shorouk",
        nameZh: "肖鲁克",
        deliveryFee: 35,
        minOrder: 0,
        estimatedTime: "30 - 60 دقيقة",
        isActive: true,
      },
    ],
  });
}

/* ───────────────────────── dashboard ───────────────────────── */

async function handleDashboard(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method !== "GET") {
    return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
  }
  const since = startOfToday();

  const [
    posSalesToday,
    posReturnsToday,
    onlineToday,
    pendingOnline,
    expensesToday,
    outOfStock,
    criticalStock,
    allTimePos,
    allTimeOnline,
    recentSales,
  ] = await Promise.all([
    prisma.sale.aggregate({
      where: { isReturn: false, createdAt: { gte: since }, status: "completed" },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.sale.aggregate({
      where: { isReturn: true, createdAt: { gte: since } },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: { createdAt: { gte: since }, status: { notIn: ["CANCELLED"] } },
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
    prisma.order.count({ where: { status: "PENDING" } }),
    prisma.expense.aggregate({
      where: { date: { gte: since } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.product.count({
      where: { isDeleted: false, stockQuantity: { lte: 0 } },
    }),
    prisma.product.count({
      where: { isDeleted: false, stockQuantity: { gt: 0, lte: 5 } },
    }),
    prisma.sale.aggregate({
      where: { isReturn: false, status: "completed" },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: { status: { notIn: ["CANCELLED"] } },
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
    prisma.sale.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        lines: true,
        user: { select: { id: true, username: true } },
      },
    }),
  ]);

  const posRevenueToday = Math.abs(posSalesToday._sum.total ?? 0);
  const onlineRevenueToday = onlineToday._sum.totalAmount ?? 0;
  const returnsValue = Math.abs(posReturnsToday._sum.total ?? 0);
  const lifetimePos = Math.abs(allTimePos._sum.total ?? 0);
  const lifetimeOnline = allTimeOnline._sum.totalAmount ?? 0;

  const stats = {
    todaySalesTotal: roundMoney(posRevenueToday + onlineRevenueToday),
    posSalesTotal: roundMoney(posRevenueToday),
    onlineSalesTotal: roundMoney(onlineRevenueToday),
    lifetimeSalesTotal: roundMoney(lifetimePos + lifetimeOnline),
    lifetimePosSales: roundMoney(lifetimePos),
    lifetimeOnlineSales: roundMoney(lifetimeOnline),
    invoicesCount:
      (posSalesToday._count._all ?? 0) + (onlineToday._count._all ?? 0),
    posInvoicesCount: posSalesToday._count._all ?? 0,
    onlineOrdersCount: onlineToday._count._all ?? 0,
    lifetimeInvoicesCount:
      (allTimePos._count._all ?? 0) + (allTimeOnline._count._all ?? 0),
    returnsTotal: roundMoney(returnsValue),
    returnsCount: posReturnsToday._count._all ?? 0,
    expensesTotal: roundMoney(expensesToday._sum.amount ?? 0),
    expensesCount: expensesToday._count._all ?? 0,
    pendingOnlineOrders: pendingOnline,
    outOfStockCount: outOfStock,
    criticalStockCount: criticalStock,
  };

  return okList(recentSales, stats, { ...stats });
}

/* ───────────────────────── low-stock ───────────────────────── */

async function handleLowStock(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method === "GET") {
    const threshold = Math.max(
      1,
      Math.floor(num(q(ctx.searchParams, "threshold"), 5)),
    );
    const products = await prisma.product.findMany({
      where: {
        isDeleted: false,
        stockQuantity: { lte: threshold },
      },
      orderBy: [{ stockQuantity: "asc" }, { name: "asc" }],
      take: 200,
      include: {
        category: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
      },
    });
    const items = products.map((p) => ({
      ...p,
      stock: p.stockQuantity,
      level: p.stockQuantity <= 0 ? "OUT" : "CRITICAL",
    }));
    return okList(items, {
      threshold,
      outOfStock: items.filter((p) => p.stockQuantity <= 0).length,
      critical: items.filter((p) => p.stockQuantity > 0).length,
    });
  }

  if (ctx.method === "PATCH") {
    const productId = String(
      ctx.body.productId ?? ctx.body.id ?? ctx.id ?? "",
    ).trim();
    const stockQuantity = num(
      ctx.body.stockQuantity ?? ctx.body.stock ?? ctx.body.qty,
      NaN,
    );
    if (!productId || !Number.isFinite(stockQuantity)) {
      return {
        ok: false,
        status: 400,
        error: "يلزم productId و stockQuantity صالحان",
      };
    }
    const product = await prisma.product.update({
      where: { id: productId },
      data: {
        stockQuantity,
        stockStatus: stockQuantity > 0 ? "instock" : "outofstock",
      },
    });
    return okOne({ item: { ...product, stock: product.stockQuantity } });
  }

  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

/* ───────────────────────── online-orders ───────────────────────── */

async function handleOnlineOrders(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method === "GET") {
    const statusRaw = q(ctx.searchParams, "status");
    const status = statusRaw ? mapMobileOrderStatus(statusRaw) : null;
    if (statusRaw && !status) {
      return { ok: false, status: 400, error: "حالة الطلب غير صالحة" };
    }
    const take = Math.min(
      100,
      Math.max(1, Math.floor(num(q(ctx.searchParams, "limit"), 100))),
    );
    const orders = await prisma.order.findMany({
      where: status ? { status: status as never } : undefined,
      orderBy: { createdAt: "desc" },
      take,
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, barcode: true, imageUrl: true },
            },
          },
        },
        customer: {
          select: { id: true, name: true, phone: true, pointsBalance: true },
        },
        assignedDriver: { select: { id: true, username: true } },
        deliveryZone: {
          select: { id: true, nameAr: true, deliveryFee: true },
        },
      },
    });
    return okList(orders, {
      pending: orders.filter((o) => o.status === "PENDING").length,
    });
  }

  if (ctx.method === "PATCH") {
    const orderId = String(ctx.body.id ?? ctx.id ?? "").trim();
    if (!orderId) {
      return { ok: false, status: 400, error: "معرف الطلب مطلوب" };
    }
    const existing = await prisma.order.findUnique({ where: { id: orderId } });
    if (!existing) {
      return { ok: false, status: 404, error: "الطلب غير موجود" };
    }

    const data: {
      status?: never;
      assignedDriverId?: string | null;
    } = {};

    if (ctx.body.status != null) {
      const mapped = mapMobileOrderStatus(String(ctx.body.status));
      if (!mapped) {
        return { ok: false, status: 400, error: "حالة الطلب غير صالحة" };
      }
      data.status = mapped as never;
    }

    if ("assignedDriverId" in ctx.body || "driverId" in ctx.body) {
      const raw = ctx.body.assignedDriverId ?? ctx.body.driverId;
      const driverId =
        raw == null || raw === "" ? null : String(raw);
      if (driverId) {
        const driver = await prisma.user.findFirst({
          where: { id: driverId, role: "DRIVER", status: "ACTIVE" },
        });
        if (!driver) {
          return {
            ok: false,
            status: 400,
            error: "السائق غير موجود أو غير نشط",
          };
        }
      }
      data.assignedDriverId = driverId;
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (data.status) {
        await applyOrderStatusLoyalty(tx, existing, data.status as never);
      }
      return tx.order.update({
        where: { id: orderId },
        data,
        include: {
          items: true,
          customer: { select: { id: true, name: true, phone: true } },
          assignedDriver: { select: { id: true, username: true } },
        },
      });
    });

    return okOne({ item: updated, order: updated });
  }

  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

/* ───────────────────────── pos-sales / returns ───────────────────────── */

async function createPosReturn(
  ctx: ModuleContext,
): Promise<ModuleResult> {
  const saleId = String(ctx.body.saleId ?? ctx.body.id ?? "").trim();
  if (!saleId) {
    return { ok: false, status: 400, error: "saleId مطلوب لإنشاء مرتجع" };
  }
  const original = await prisma.sale.findUnique({
    where: { id: saleId },
    include: { lines: true },
  });
  if (!original || original.isReturn) {
    return { ok: false, status: 404, error: "الفاتورة الأصلية غير موجودة" };
  }

  const rawLines = Array.isArray(ctx.body.lines) ? ctx.body.lines : null;
  const returnLines =
    rawLines == null
      ? original.lines.map((line) => ({
          wcProductId: line.wcProductId,
          name: line.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          lineTotal: -Math.abs(line.lineTotal),
          stockMultiplier: 1,
          productId: line.productId,
        }))
      : (rawLines as Record<string, unknown>[]).map((row) => {
          const quantity = Math.abs(num(row.quantity ?? row.qty, 0));
          const unitPrice = Math.abs(num(row.unitPrice ?? row.price, 0));
          return {
            wcProductId:
              row.wcProductId != null ? Number(row.wcProductId) : null,
            name: String(row.name ?? "صنف"),
            quantity,
            unitPrice,
            lineTotal: -roundMoney(quantity * unitPrice),
            stockMultiplier: Math.max(
              1,
              Math.floor(num(row.stockMultiplier, 1)),
            ),
            productId: String(row.productId ?? "").trim() || null,
          };
        });

  const total = -roundMoney(
    returnLines.reduce((s, l) => s + Math.abs(l.lineTotal), 0),
  );

  let shift = await prisma.shift.findFirst({
    where: { userId: ctx.user.id, status: "OPEN" },
  });
  if (!shift) {
    shift = await prisma.shift.create({
      data: {
        userId: ctx.user.id,
        startingCash: 0,
        status: "OPEN",
      },
    });
  }

  const sale = await prisma.$transaction(async (tx) => {
    for (const line of returnLines) {
      const addQty =
        Math.abs(line.quantity) *
        Math.max(1, Math.floor(line.stockMultiplier || 1));
      if (addQty <= 0) continue;

      if (line.productId) {
        await tx.product.update({
          where: { id: line.productId },
          data: {
            stockQuantity: { increment: addQty },
            stockStatus: "instock",
          },
        });
        continue;
      }

      const wcId = Number(line.wcProductId);
      if (!Number.isFinite(wcId) || wcId <= 0) continue;
      const product = await tx.product.findFirst({
        where: { wcId, isDeleted: false },
        select: { id: true },
      });
      if (!product) continue;
      await tx.product.update({
        where: { id: product.id },
        data: {
          stockQuantity: { increment: addQty },
          stockStatus: "instock",
        },
      });
    }

    await tx.shift.update({
      where: { id: shift!.id },
      data: {
        cashSales: { increment: total },
        tickets: { increment: 1 },
      },
    });

    return persistSaleRecord(
      {
        shiftId: shift!.id,
        userId: ctx.user.id,
        total,
        paymentMethod: original.paymentMethod,
        isReturn: true,
        customerName: original.customerName,
        lines: returnLines,
      },
      tx,
    );
  });

  return okOne(
    {
      item: sale,
      sale,
      invoiceNumber: sale.orderNumber,
      originalSaleId: original.id,
    },
    201,
  );
}

async function handlePosSales(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method === "GET") {
    const isReturn = q(ctx.searchParams, "isReturn");
    const take = Math.min(
      100,
      Math.max(1, Math.floor(num(q(ctx.searchParams, "limit"), 100))),
    );
    const sales = await prisma.sale.findMany({
      where: {
        ...(isReturn === "1" || isReturn === "true"
          ? { isReturn: true }
          : isReturn === "0" || isReturn === "false"
            ? { isReturn: false }
            : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
      include: {
        lines: true,
        user: { select: { id: true, username: true } },
      },
    });
    return okList(sales, {
      salesTotal: roundMoney(
        sales.filter((s) => !s.isReturn).reduce((a, s) => a + s.total, 0),
      ),
      returnsTotal: roundMoney(
        Math.abs(
          sales.filter((s) => s.isReturn).reduce((a, s) => a + s.total, 0),
        ),
      ),
    });
  }

  if (ctx.method === "POST") {
    return createPosReturn(ctx);
  }

  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

async function handleReturns(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method === "GET") {
    const take = Math.min(
      100,
      Math.max(1, Math.floor(num(q(ctx.searchParams, "limit"), 100))),
    );
    const sales = await prisma.sale.findMany({
      where: { isReturn: true },
      orderBy: { createdAt: "desc" },
      take,
      include: {
        lines: true,
        user: { select: { id: true, username: true } },
      },
    });
    return okList(sales, {
      returnsTotal: roundMoney(
        Math.abs(sales.reduce((a, s) => a + s.total, 0)),
      ),
    });
  }
  if (ctx.method === "POST") {
    return createPosReturn(ctx);
  }
  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

/* ───────────────────────── shifts ───────────────────────── */

async function handleShifts(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method === "GET") {
    const status = q(ctx.searchParams, "status");
    const shifts = await prisma.shift.findMany({
      where: status ? { status: status.toUpperCase() } : undefined,
      orderBy: { startTime: "desc" },
      take: 100,
      include: { user: { select: { id: true, username: true } } },
    });
    const items = shifts.map((s) => {
      const expectedCash = roundMoney(s.startingCash + s.cashSales);
      return {
        ...s,
        employeeName: s.user?.username ?? null,
        expectedCash,
        variance:
          s.variance ??
          (s.actualCash != null
            ? roundMoney(s.actualCash - expectedCash)
            : null),
      };
    });
    return okList(items, {
      openCount: items.filter((s) => s.status === "OPEN").length,
    });
  }

  if (ctx.method === "PATCH" || ctx.method === "POST") {
    const shiftId = Math.floor(num(ctx.body.id ?? ctx.id, 0));
    const actualCash = num(ctx.body.actualCash, NaN);
    if (!shiftId) {
      return { ok: false, status: 400, error: "معرف الوردية مطلوب" };
    }
    const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift) {
      return { ok: false, status: 404, error: "الوردية غير موجودة" };
    }
    if (shift.status === "CLOSED") {
      return { ok: false, status: 400, error: "الوردية مغلقة مسبقاً" };
    }
    const expectedCash = roundMoney(shift.startingCash + shift.cashSales);
    const counted = Number.isFinite(actualCash) ? actualCash : expectedCash;
    const variance = roundMoney(counted - expectedCash);
    const closed = await prisma.shift.update({
      where: { id: shiftId },
      data: {
        status: "CLOSED",
        endTime: new Date(),
        actualCash: counted,
        variance,
      },
      include: { user: { select: { id: true, username: true } } },
    });
    return okOne({
      item: {
        ...closed,
        employeeName: closed.user?.username ?? null,
        expectedCash,
      },
      shift: closed,
    });
  }

  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

/* ───────────────────────── products ───────────────────────── */

async function handleProducts(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method === "GET") {
    const search = q(ctx.searchParams, "q") || q(ctx.searchParams, "search");
    const take = Math.min(
      100,
      Math.max(1, Math.floor(num(q(ctx.searchParams, "limit"), 100))),
    );
    const products = await prisma.product.findMany({
      where: {
        isDeleted: false,
        ...(search
          ? {
              OR: [
                { name: { contains: search } },
                { barcode: { contains: search } },
                { sku: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: { name: "asc" },
      take,
      include: {
        category: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
      },
    });
    const items = products.map((p) => ({
      ...p,
      stock: p.stockQuantity,
    }));
    return okList(items);
  }

  if (ctx.method === "POST") {
    const name = String(ctx.body.name ?? "").trim();
    if (!name) {
      return { ok: false, status: 400, error: "اسم المنتج مطلوب" };
    }
    const price = Math.max(0, num(ctx.body.price, 0));
    const stockQuantity = Math.max(
      0,
      num(ctx.body.stockQuantity ?? ctx.body.stock, 0),
    );
    const barcode =
      String(ctx.body.barcode ?? "").trim() ||
      `MOB-${Date.now().toString(36)}`;
    const product = await prisma.product.create({
      data: {
        name,
        nameEn: String(ctx.body.nameEn ?? "").trim() || null,
        nameZh: String(ctx.body.nameZh ?? "").trim() || null,
        barcode,
        sku: String(ctx.body.sku ?? "").trim() || null,
        price,
        salePrice:
          ctx.body.salePrice != null ? num(ctx.body.salePrice) : null,
        buyingCost: Math.max(0, num(ctx.body.buyingCost, 0)),
        stockQuantity,
        stockStatus: stockQuantity > 0 ? "instock" : "outofstock",
        isActive: ctx.body.isActive === false ? false : true,
        isWeighed: Boolean(ctx.body.isWeighed ?? ctx.body.isWeighted),
        categoryId: String(ctx.body.categoryId ?? "").trim() || null,
        brandId: String(ctx.body.brandId ?? "").trim() || null,
        wcId: -Math.abs(
          Number(`${Date.now()}${Math.floor(Math.random() * 1000)}`) %
            2_000_000_000,
        ),
      },
    });
    return okOne(
      { item: { ...product, stock: product.stockQuantity }, product },
      201,
    );
  }

  if (ctx.method === "PATCH") {
    const productId = String(ctx.body.id ?? ctx.id ?? "").trim();
    if (!productId) {
      return { ok: false, status: 400, error: "معرف المنتج مطلوب" };
    }
    const data: Record<string, unknown> = {};
    if (ctx.body.name != null) data.name = String(ctx.body.name).trim();
    if (ctx.body.price != null) data.price = Math.max(0, num(ctx.body.price));
    if (ctx.body.salePrice != null) {
      data.salePrice =
        ctx.body.salePrice === "" || ctx.body.salePrice === null
          ? null
          : Math.max(0, num(ctx.body.salePrice));
    }
    if (ctx.body.stockQuantity != null || ctx.body.stock != null) {
      const qty = num(ctx.body.stockQuantity ?? ctx.body.stock);
      data.stockQuantity = qty;
      data.stockStatus = qty > 0 ? "instock" : "outofstock";
    }
    if (ctx.body.isActive != null) data.isActive = Boolean(ctx.body.isActive);
    if (ctx.body.barcode != null) {
      data.barcode = String(ctx.body.barcode).trim();
    }
    if (ctx.body.categoryId != null) {
      data.categoryId = String(ctx.body.categoryId).trim() || null;
    }
    if (ctx.body.brandId != null) {
      data.brandId = String(ctx.body.brandId).trim() || null;
    }
    if (ctx.body.isDeleted === true) data.isDeleted = true;

    const product = await prisma.product.update({
      where: { id: productId },
      data,
    });
    return okOne({
      item: { ...product, stock: product.stockQuantity },
      product,
    });
  }

  if (ctx.method === "DELETE") {
    const productId = String(ctx.body.id ?? ctx.id ?? "").trim();
    if (!productId) {
      return { ok: false, status: 400, error: "معرف المنتج مطلوب" };
    }
    const product = await prisma.product.update({
      where: { id: productId },
      data: { isDeleted: true, isActive: false },
    });
    return okOne({ item: product, deleted: true });
  }

  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

/* ───────────────────────── categories ───────────────────────── */

async function handleCategories(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method === "GET") {
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { products: true } } },
    });
    return okList(categories);
  }
  if (ctx.method === "POST") {
    const name = String(ctx.body.name ?? "").trim();
    if (!name) return { ok: false, status: 400, error: "اسم القسم مطلوب" };
    const slug =
      String(ctx.body.slug ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-") || `cat-${Date.now().toString(36)}`;
    const category = await prisma.category.create({
      data: {
        name,
        nameEn: String(ctx.body.nameEn ?? "").trim() || null,
        nameZh: String(ctx.body.nameZh ?? "").trim() || null,
        slug,
        description: String(ctx.body.description ?? "").trim() || null,
        image: String(ctx.body.image ?? "").trim() || null,
      },
    });
    return okOne({ item: category, category }, 201);
  }
  if (ctx.method === "PATCH") {
    const id = String(ctx.body.id ?? ctx.id ?? "").trim();
    if (!id) return { ok: false, status: 400, error: "معرف القسم مطلوب" };
    const data: Record<string, unknown> = {};
    if (ctx.body.name != null) data.name = String(ctx.body.name).trim();
    if (ctx.body.nameEn != null) {
      data.nameEn = String(ctx.body.nameEn).trim() || null;
    }
    if (ctx.body.nameZh != null) {
      data.nameZh = String(ctx.body.nameZh).trim() || null;
    }
    if (ctx.body.description != null) {
      data.description = String(ctx.body.description).trim() || null;
    }
    if (ctx.body.image != null) {
      data.image = String(ctx.body.image).trim() || null;
    }
    const category = await prisma.category.update({ where: { id }, data });
    return okOne({ item: category, category });
  }
  if (ctx.method === "DELETE") {
    const id = String(ctx.body.id ?? ctx.id ?? "").trim();
    if (!id) return { ok: false, status: 400, error: "معرف القسم مطلوب" };
    await prisma.category.delete({ where: { id } });
    return okOne({ deleted: true, id });
  }
  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

/* ───────────────────────── brands ───────────────────────── */

async function handleBrands(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method === "GET") {
    const brands = await prisma.brand.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { products: true } } },
    });
    return okList(brands);
  }
  if (ctx.method === "POST") {
    const name = String(ctx.body.name ?? "").trim();
    if (!name) return { ok: false, status: 400, error: "اسم العلامة مطلوب" };
    const brand = await prisma.brand.create({
      data: {
        name,
        nameEn: String(ctx.body.nameEn ?? "").trim() || null,
        nameZh: String(ctx.body.nameZh ?? "").trim() || null,
        image: String(ctx.body.image ?? "").trim() || null,
      },
    });
    return okOne({ item: brand, brand }, 201);
  }
  if (ctx.method === "PATCH") {
    const id = String(ctx.body.id ?? ctx.id ?? "").trim();
    if (!id) return { ok: false, status: 400, error: "معرف العلامة مطلوب" };
    const data: Record<string, unknown> = {};
    if (ctx.body.name != null) data.name = String(ctx.body.name).trim();
    if (ctx.body.nameEn != null) {
      data.nameEn = String(ctx.body.nameEn).trim() || null;
    }
    if (ctx.body.nameZh != null) {
      data.nameZh = String(ctx.body.nameZh).trim() || null;
    }
    if (ctx.body.image != null) {
      data.image = String(ctx.body.image).trim() || null;
    }
    const brand = await prisma.brand.update({ where: { id }, data });
    return okOne({ item: brand, brand });
  }
  if (ctx.method === "DELETE") {
    const id = String(ctx.body.id ?? ctx.id ?? "").trim();
    if (!id) return { ok: false, status: 400, error: "معرف العلامة مطلوب" };
    await prisma.brand.delete({ where: { id } });
    return okOne({ deleted: true, id });
  }
  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

/* ───────────────────────── purchases / new-purchase ───────────────────────── */

async function handlePurchases(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method === "GET") {
    const invoices = await prisma.purchaseInvoice.findMany({
      orderBy: { date: "desc" },
      take: 100,
      include: {
        supplier: { select: { id: true, name: true, phone: true } },
        items: {
          include: { product: { select: { id: true, name: true, barcode: true } } },
        },
      },
    });
    return okList(invoices, {
      totalAmount: roundMoney(
        invoices.reduce((a, i) => a + i.totalAmount, 0),
      ),
    });
  }
  if (ctx.method === "POST") {
    try {
      const items = (Array.isArray(ctx.body.items) ? ctx.body.items : []).map(
        (row) => {
          const r = row as Record<string, unknown>;
          return {
            productId: String(r.productId ?? r.id ?? "").trim(),
            quantity: Math.floor(num(r.quantity ?? r.qty, 0)),
            unitCost: num(r.unitCost ?? r.cost ?? r.price, 0),
            resetPackages: Boolean(r.resetPackages),
          };
        },
      );
      const invoice = await createPurchaseInvoice({
        supplierId: Math.floor(num(ctx.body.supplierId, 0)),
        invoiceNumber: String(ctx.body.invoiceNumber ?? "").trim() || null,
        date: String(ctx.body.date ?? "").trim() || null,
        paidAmount: num(ctx.body.paidAmount, 0),
        items,
      });
      return okOne({ item: invoice, invoice }, 201);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "تعذر إنشاء فاتورة المشتريات";
      return { ok: false, status: 400, error: message };
    }
  }
  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

async function handlePurchaseReturns(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method === "GET") {
    const returns = await prisma.purchaseReturn.findMany({
      orderBy: { date: "desc" },
      take: 100,
      include: {
        supplier: { select: { id: true, name: true } },
        items: {
          include: { product: { select: { id: true, name: true } } },
        },
      },
    });
    return okList(returns);
  }
  if (ctx.method === "POST") {
    try {
      const items = (Array.isArray(ctx.body.items) ? ctx.body.items : []).map(
        (row) => {
          const r = row as Record<string, unknown>;
          return {
            productId: String(r.productId ?? r.id ?? "").trim(),
            quantity: Math.floor(num(r.quantity ?? r.qty, 0)),
            unitCost: num(r.unitCost ?? r.cost ?? r.price, 0),
          };
        },
      );
      const purchaseReturn = await createPurchaseReturn({
        supplierId: Math.floor(num(ctx.body.supplierId, 0)),
        date: String(ctx.body.date ?? "").trim() || null,
        notes: String(ctx.body.notes ?? "").trim() || null,
        items,
      });
      return okOne({ item: purchaseReturn, purchaseReturn }, 201);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "تعذر إنشاء مرتجع المشتريات";
      return { ok: false, status: 400, error: message };
    }
  }
  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

/* ───────────────────────── suppliers ───────────────────────── */

async function handleSuppliers(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method === "GET") {
    const suppliers = await prisma.supplier.findMany({
      orderBy: { name: "asc" },
    });
    return okList(suppliers, {
      totalBalance: roundMoney(
        suppliers.reduce((a, s) => a + s.balance, 0),
      ),
    });
  }
  if (ctx.method === "POST") {
    const name = String(ctx.body.name ?? "").trim();
    const action = String(ctx.body.action ?? "create").trim().toLowerCase();

    if (
      action === "pay" ||
      (ctx.body.amount != null &&
        (ctx.body.supplierId != null || ctx.body.id != null))
    ) {
      const supplierId = Math.floor(num(ctx.body.supplierId ?? ctx.body.id, 0));
      const amount = Math.abs(num(ctx.body.amount, 0));
      if (!supplierId || amount <= 0) {
        return {
          ok: false,
          status: 400,
          error: "supplierId والمبلغ مطلوبان",
        };
      }
      const payment = await prisma.$transaction(async (tx) => {
        const supplier = await tx.supplier.update({
          where: { id: supplierId },
          data: { balance: { decrement: amount } },
        });
        const row = await tx.supplierPayment.create({
          data: {
            supplierId,
            amount,
            notes: String(ctx.body.notes ?? "").trim() || null,
            bankAccountId:
              ctx.body.bankAccountId != null
                ? Math.floor(num(ctx.body.bankAccountId))
                : null,
          },
        });
        return { payment: row, supplier };
      });
      return okOne({
        item: payment.payment,
        payment: payment.payment,
        supplier: payment.supplier,
      });
    }

    if (!name) return { ok: false, status: 400, error: "اسم المورد مطلوب" };
    const opening = Math.max(
      0,
      num(ctx.body.openingBalance ?? ctx.body.balance, 0),
    );
    const supplier = await prisma.supplier.create({
      data: {
        name,
        phone: String(ctx.body.phone ?? "").trim() || null,
        openingBalance: opening,
        balance: opening,
      },
    });
    return okOne({ item: supplier, supplier }, 201);
  }
  if (ctx.method === "PATCH") {
    const id = Math.floor(num(ctx.body.id ?? ctx.id, 0));
    if (!id) return { ok: false, status: 400, error: "معرف المورد مطلوب" };
    const data: Record<string, unknown> = {};
    if (ctx.body.name != null) data.name = String(ctx.body.name).trim();
    if (ctx.body.phone != null) {
      data.phone = String(ctx.body.phone).trim() || null;
    }
    if (ctx.body.openingBalance != null) {
      data.openingBalance = Math.max(0, num(ctx.body.openingBalance));
    }
    const supplier = await prisma.supplier.update({ where: { id }, data });
    return okOne({ item: supplier, supplier });
  }
  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

/* ───────────────────────── expenses ───────────────────────── */

async function handleExpenses(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method === "GET") {
    const expenses = await prisma.expense.findMany({
      orderBy: { date: "desc" },
      take: 100,
      include: { category: true, bankAccount: true },
    });
    return okList(expenses, {
      totalAmount: roundMoney(
        expenses.reduce((a, e) => a + e.amount, 0),
      ),
    });
  }
  if (ctx.method === "POST") {
    const categoryId = Math.floor(num(ctx.body.categoryId, 0));
    const amount = Math.abs(num(ctx.body.amount, 0));
    if (!categoryId || amount <= 0) {
      return { ok: false, status: 400, error: "التصنيف والمبلغ مطلوبان" };
    }
    try {
      const expenseDate = ctx.body.date
        ? new Date(String(ctx.body.date))
        : new Date();
      const bankAccountId =
        ctx.body.bankAccountId != null
          ? Math.floor(num(ctx.body.bankAccountId))
          : null;
      const expense = await prisma.$transaction(async (tx) => {
        const row = await tx.expense.create({
          data: {
            categoryId,
            amount,
            date: expenseDate,
            notes: String(ctx.body.notes ?? "").trim() || null,
            bankAccountId,
          },
          include: { category: true },
        });
        await debitPaymentSource(tx, {
          sourceType: bankAccountId ? "BANK" : "TREASURY",
          bankAccountId,
          amount,
          reference: "EXPENSE",
          description: `مصروف: ${row.category.name}${row.notes ? ` — ${row.notes}` : ""}`,
          date: expenseDate,
        });
        return row;
      });
      return okOne({ item: expense, expense }, 201);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "تعذر تسجيل المصروف";
      return { ok: false, status: 400, error: message };
    }
  }
  if (ctx.method === "DELETE") {
    const id = Math.floor(num(ctx.body.id ?? ctx.id, 0));
    if (!id) return { ok: false, status: 400, error: "معرف المصروف مطلوب" };
    await prisma.expense.delete({ where: { id } });
    return okOne({ deleted: true, id });
  }
  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

/* ───────────────────────── drivers ───────────────────────── */

async function handleDrivers(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method === "GET") {
    const rows = await prisma.user.findMany({
      where: { role: "DRIVER" },
      orderBy: { username: "asc" },
      select: {
        id: true,
        username: true,
        status: true,
        createdAt: true,
        assignedOrders: {
          where: {
            status: { in: ["PENDING", "CONFIRMED", "PREPARING", "SHIPPED"] },
          },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            customerName: true,
            totalAmount: true,
          },
          take: 20,
        },
      },
    });
    const drivers = rows.map((d) => ({
      ...d,
      name: d.username,
      phone: d.username,
    }));
    return okList(drivers);
  }
  if (ctx.method === "POST") {
    const username = String(
      ctx.body.username ?? ctx.body.phone ?? ctx.body.name ?? "",
    ).trim();
    const password = String(ctx.body.password ?? "1234").trim();
    if (!username) {
      return { ok: false, status: 400, error: "اسم المستخدم أو الهاتف مطلوب" };
    }
    const hash = await bcrypt.hash(password, 10);
    const driver = await prisma.user.create({
      data: {
        username,
        password: hash,
        role: "DRIVER",
        status: "ACTIVE",
      },
      select: { id: true, username: true, status: true, role: true },
    });
    return okOne(
      {
        item: { ...driver, phone: driver.username, name: driver.username },
        driver,
      },
      201,
    );
  }
  if (ctx.method === "PATCH") {
    const id = String(ctx.body.id ?? ctx.id ?? "").trim();
    if (!id) return { ok: false, status: 400, error: "معرف السائق مطلوب" };
    const data: Record<string, unknown> = {};
    if (ctx.body.username != null) {
      data.username = String(ctx.body.username).trim();
    } else if (ctx.body.phone != null) {
      data.username = String(ctx.body.phone).trim();
    } else if (ctx.body.name != null) {
      data.username = String(ctx.body.name).trim();
    }
    if (ctx.body.status != null) {
      data.status =
        String(ctx.body.status).toUpperCase() === "SUSPENDED"
          ? "SUSPENDED"
          : "ACTIVE";
    }
    if (ctx.body.password) {
      data.password = await bcrypt.hash(String(ctx.body.password), 10);
    }
    const driver = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, username: true, status: true, role: true },
    });
    return okOne({
      item: { ...driver, phone: driver.username, name: driver.username },
      driver,
    });
  }
  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

/* ───────────────────────── delivery-zones ───────────────────────── */

async function handleDeliveryZones(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method === "GET") {
    await ensureDefaultDeliveryZones();
    const zones = await prisma.deliveryZone.findMany({
      orderBy: { nameAr: "asc" },
    });
    return okList(zones);
  }
  if (ctx.method === "POST") {
    const nameAr = String(ctx.body.nameAr ?? ctx.body.name ?? "").trim();
    if (!nameAr) return { ok: false, status: 400, error: "اسم المنطقة مطلوب" };
    const zone = await prisma.deliveryZone.create({
      data: {
        nameAr,
        nameEn: String(ctx.body.nameEn ?? "").trim() || nameAr,
        nameZh: String(ctx.body.nameZh ?? "").trim() || nameAr,
        deliveryFee: Math.max(0, num(ctx.body.deliveryFee ?? ctx.body.fee, 0)),
        minOrder: Math.max(0, num(ctx.body.minOrder, 0)),
        estimatedTime: String(ctx.body.estimatedTime ?? "").trim() || null,
        isActive: ctx.body.isActive === false ? false : true,
      },
    });
    return okOne({ item: zone, zone }, 201);
  }
  if (ctx.method === "PATCH") {
    const id = String(ctx.body.id ?? ctx.id ?? "").trim();
    if (!id) return { ok: false, status: 400, error: "معرف المنطقة مطلوب" };
    const data: Record<string, unknown> = {};
    if (ctx.body.nameAr != null || ctx.body.name != null) {
      data.nameAr = String(ctx.body.nameAr ?? ctx.body.name).trim();
    }
    if (ctx.body.nameEn != null) data.nameEn = String(ctx.body.nameEn).trim();
    if (ctx.body.nameZh != null) data.nameZh = String(ctx.body.nameZh).trim();
    if (ctx.body.deliveryFee != null || ctx.body.fee != null) {
      data.deliveryFee = Math.max(0, num(ctx.body.deliveryFee ?? ctx.body.fee));
    }
    if (ctx.body.minOrder != null) {
      data.minOrder = Math.max(0, num(ctx.body.minOrder));
    }
    if (ctx.body.estimatedTime != null) {
      data.estimatedTime = String(ctx.body.estimatedTime).trim() || null;
    }
    if (ctx.body.isActive != null) data.isActive = Boolean(ctx.body.isActive);
    const zone = await prisma.deliveryZone.update({ where: { id }, data });
    return okOne({ item: zone, zone });
  }
  if (ctx.method === "DELETE") {
    const id = String(ctx.body.id ?? ctx.id ?? "").trim();
    if (!id) return { ok: false, status: 400, error: "معرف المنطقة مطلوب" };
    await prisma.deliveryZone.delete({ where: { id } });
    return okOne({ deleted: true, id });
  }
  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

/* ───────────────────────── coupons ───────────────────────── */

async function handleCoupons(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method === "GET") {
    const coupons = await prisma.coupon.findMany({
      orderBy: { createdAt: "desc" },
    });
    return okList(coupons);
  }
  if (ctx.method === "POST") {
    const code = String(ctx.body.code ?? "").trim().toUpperCase();
    if (!code) return { ok: false, status: 400, error: "كود الخصم مطلوب" };
    const coupon = await prisma.coupon.create({
      data: {
        code,
        discountType:
          String(ctx.body.discountType ?? "PERCENTAGE").toUpperCase() ===
          "FIXED"
            ? "FIXED"
            : "PERCENTAGE",
        discountValue: Math.max(0, num(ctx.body.discountValue, 0)),
        minOrder: Math.max(0, num(ctx.body.minOrder, 0)),
        maxDiscount:
          ctx.body.maxDiscount != null ? num(ctx.body.maxDiscount) : null,
        usageLimit:
          ctx.body.usageLimit != null
            ? Math.floor(num(ctx.body.usageLimit))
            : null,
        expiresAt: ctx.body.expiresAt
          ? new Date(String(ctx.body.expiresAt))
          : null,
        isActive: ctx.body.isActive === false ? false : true,
      },
    });
    return okOne({ item: coupon, coupon }, 201);
  }
  if (ctx.method === "PATCH") {
    const id = String(ctx.body.id ?? ctx.id ?? "").trim();
    if (!id) return { ok: false, status: 400, error: "معرف الكوبون مطلوب" };
    const data: Record<string, unknown> = {};
    if (ctx.body.code != null) {
      data.code = String(ctx.body.code).trim().toUpperCase();
    }
    if (ctx.body.discountType != null) {
      data.discountType =
        String(ctx.body.discountType).toUpperCase() === "FIXED"
          ? "FIXED"
          : "PERCENTAGE";
    }
    if (ctx.body.discountValue != null) {
      data.discountValue = Math.max(0, num(ctx.body.discountValue));
    }
    if (ctx.body.isActive != null) data.isActive = Boolean(ctx.body.isActive);
    if (ctx.body.expiresAt != null) {
      data.expiresAt = ctx.body.expiresAt
        ? new Date(String(ctx.body.expiresAt))
        : null;
    }
    const coupon = await prisma.coupon.update({ where: { id }, data });
    return okOne({ item: coupon, coupon });
  }
  if (ctx.method === "DELETE") {
    const id = String(ctx.body.id ?? ctx.id ?? "").trim();
    if (!id) return { ok: false, status: 400, error: "معرف الكوبون مطلوب" };
    await prisma.coupon.delete({ where: { id } });
    return okOne({ deleted: true, id });
  }
  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

/* ───────────────────────── notifications ───────────────────────── */

async function handleNotifications(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method === "GET") {
    const notifications = await prisma.customerNotification.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
      },
    });
    return okList(notifications);
  }
  if (ctx.method === "POST") {
    const titleAr = String(ctx.body.titleAr ?? ctx.body.title ?? "").trim();
    const bodyAr = String(ctx.body.bodyAr ?? ctx.body.body ?? "").trim();
    if (!titleAr || !bodyAr) {
      return { ok: false, status: 400, error: "عنوان ونص الإشعار مطلوبان" };
    }
    const customerId = String(ctx.body.customerId ?? "").trim() || null;
    const notification = await prisma.customerNotification.create({
      data: {
        customerId,
        titleAr,
        titleEn: String(ctx.body.titleEn ?? titleAr).trim(),
        titleZh: String(ctx.body.titleZh ?? titleAr).trim(),
        bodyAr,
        bodyEn: String(ctx.body.bodyEn ?? bodyAr).trim(),
        bodyZh: String(ctx.body.bodyZh ?? bodyAr).trim(),
        type: customerId ? "GENERAL" : "BROADCAST",
        orderId: String(ctx.body.orderId ?? "").trim() || null,
      },
    });
    return okOne({ item: notification, notification }, 201);
  }
  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

/* ───────────────────────── customer-chat ───────────────────────── */

async function handleCustomerChat(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method === "GET") {
    const customerId = q(ctx.searchParams, "customerId");
    const messages = await prisma.chatMessage.findMany({
      where: customerId ? { customerId } : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
      },
    });
    return okList(messages, {
      unreadByAdmin: messages.filter((m) => !m.isReadByAdmin).length,
    });
  }
  if (ctx.method === "POST") {
    const customerId = String(ctx.body.customerId ?? "").trim();
    const text = String(ctx.body.text ?? ctx.body.message ?? "").trim();
    if (!customerId || !text) {
      return {
        ok: false,
        status: 400,
        error: "customerId ونص الرسالة مطلوبان",
      };
    }
    const message = await prisma.chatMessage.create({
      data: {
        customerId,
        senderRole: "ADMIN",
        originalText: text,
        originalLang: "ar",
        textAr: text,
        textEn: text,
        textZh: text,
        isReadByAdmin: true,
        isReadByCustomer: false,
      },
    });
    return okOne({ item: message, message }, 201);
  }
  if (ctx.method === "PATCH") {
    const id = String(ctx.body.id ?? ctx.id ?? "").trim();
    if (!id) return { ok: false, status: 400, error: "معرف الرسالة مطلوب" };
    const message = await prisma.chatMessage.update({
      where: { id },
      data: { isReadByAdmin: true },
    });
    return okOne({ item: message, message });
  }
  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

/* ───────────────────────── customers ───────────────────────── */

async function handleCustomers(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method === "GET") {
    const search = q(ctx.searchParams, "q") || q(ctx.searchParams, "phone");
    const customers = await prisma.customer.findMany({
      where: {
        deletedAt: null,
        ...(search
          ? {
              OR: [
                { phone: { contains: search } },
                { name: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        name: true,
        phone: true,
        pointsBalance: true,
        createdAt: true,
        orders: {
          where: { status: { notIn: ["CANCELLED"] } },
          select: { totalAmount: true },
        },
      },
    });
    const items = customers.map((c) => {
      const totalPurchases = roundMoney(
        c.orders.reduce((a, o) => a + o.totalAmount, 0),
      );
      const { orders: _orders, ...rest } = c;
      return {
        ...rest,
        totalPurchases,
        ordersCount: c.orders.length,
      };
    });
    return okList(items);
  }

  if (ctx.method === "POST") {
    const phone = String(ctx.body.phone ?? "").trim();
    if (!phone) {
      return { ok: false, status: 400, error: "رقم هاتف العميل مطلوب" };
    }
    const customer = await prisma.customer.create({
      data: {
        phone,
        name: String(ctx.body.name ?? "").trim() || null,
        pointsBalance: Math.max(
          0,
          Math.floor(num(ctx.body.pointsBalance, 0)),
        ),
      },
      select: {
        id: true,
        name: true,
        phone: true,
        pointsBalance: true,
        createdAt: true,
      },
    });
    return okOne({ item: customer, customer }, 201);
  }

  if (ctx.method === "PATCH") {
    const id = String(ctx.body.id ?? ctx.id ?? "").trim();
    if (!id) return { ok: false, status: 400, error: "معرف العميل مطلوب" };
    const data: Record<string, unknown> = {};
    if (ctx.body.name != null) {
      data.name = String(ctx.body.name).trim() || null;
    }
    if (ctx.body.phone != null) data.phone = String(ctx.body.phone).trim();

    if (ctx.body.pointsDelta != null) {
      const delta = Math.floor(num(ctx.body.pointsDelta));
      const customer = await prisma.$transaction(async (tx) => {
        const updated = await tx.customer.update({
          where: { id },
          data: { pointsBalance: { increment: delta } },
          select: {
            id: true,
            name: true,
            phone: true,
            pointsBalance: true,
          },
        });
        await tx.pointsTransaction.create({
          data: {
            customerId: id,
            points: delta,
            type: delta >= 0 ? "EARN" : "REDEEM",
            description: String(ctx.body.note ?? "تعديل من تطبيق الإدارة"),
          },
        });
        return updated;
      });
      return okOne({ item: customer, customer });
    }

    if (ctx.body.pointsBalance != null) {
      data.pointsBalance = Math.max(
        0,
        Math.floor(num(ctx.body.pointsBalance)),
      );
    }

    const customer = await prisma.customer.update({
      where: { id },
      data,
      select: { id: true, name: true, phone: true, pointsBalance: true },
    });
    return okOne({ item: customer, customer });
  }
  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

/* ───────────────────────── employees ───────────────────────── */

async function handleEmployees(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method === "GET") {
    const [users, staff] = await Promise.all([
      prisma.user.findMany({
        orderBy: { username: "asc" },
        select: {
          id: true,
          username: true,
          role: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.employee.findMany({
        orderBy: { name: "asc" },
        include: {
          transactions: { orderBy: { date: "desc" }, take: 5 },
        },
      }),
    ]);

    const items = [
      ...users.map((u) => ({
        id: u.id,
        name: u.username,
        username: u.username,
        role: u.role,
        status: u.status,
        isActive: u.status === "ACTIVE",
        salary: null as number | null,
        baseSalary: null as number | null,
        kind: "user" as const,
        createdAt: u.createdAt,
      })),
      ...staff.map((e) => ({
        id: String(e.id),
        employeeId: e.id,
        name: e.name,
        username: e.name,
        role: "STAFF",
        status: e.isActive ? "ACTIVE" : "SUSPENDED",
        isActive: e.isActive,
        salary: e.baseSalary,
        baseSalary: e.baseSalary,
        kind: "employee" as const,
        hireDate: e.hireDate,
        transactions: e.transactions,
        createdAt: e.createdAt,
      })),
    ];

    return okList(items, {
      usersCount: users.length,
      staffCount: staff.length,
    });
  }

  if (ctx.method === "POST") {
    const action = String(ctx.body.action ?? "user").trim().toLowerCase();

    if (action === "payroll" || action === "transaction") {
      const employeeId = Math.floor(num(ctx.body.employeeId, 0));
      const amount = Math.abs(num(ctx.body.amount, 0));
      const type = String(ctx.body.type ?? "SALARY_PAYMENT").toUpperCase();
      if (!employeeId || amount <= 0) {
        return { ok: false, status: 400, error: "الموظف والمبلغ مطلوبان" };
      }
      const allowed = new Set([
        "ADVANCE",
        "DEDUCTION",
        "BONUS",
        "SALARY_PAYMENT",
      ]);
      if (!allowed.has(type)) {
        return { ok: false, status: 400, error: "نوع الحركة غير صالح" };
      }
      const transaction = await prisma.employeeTransaction.create({
        data: {
          employeeId,
          amount,
          type: type as never,
          note: String(ctx.body.note ?? "").trim() || null,
          daysDeducted:
            ctx.body.daysDeducted != null
              ? Math.max(0, num(ctx.body.daysDeducted))
              : null,
        },
      });
      return okOne({ item: transaction, transaction }, 201);
    }

    if (action === "staff" || action === "employee") {
      const name = String(ctx.body.name ?? "").trim();
      if (!name) return { ok: false, status: 400, error: "اسم الموظف مطلوب" };
      const employee = await prisma.employee.create({
        data: {
          name,
          baseSalary: Math.max(
            0,
            num(ctx.body.baseSalary ?? ctx.body.salary, 0),
          ),
          isActive: ctx.body.isActive === false ? false : true,
          hireDate: ctx.body.hireDate
            ? new Date(String(ctx.body.hireDate))
            : new Date(),
        },
      });
      return okOne({ item: employee, employee }, 201);
    }

    const username = String(ctx.body.username ?? ctx.body.name ?? "").trim();
    const password = String(ctx.body.password ?? "").trim();
    const role = String(ctx.body.role ?? "CASHIER").trim().toUpperCase();
    if (!username || !password) {
      return {
        ok: false,
        status: 400,
        error: "اسم المستخدم وكلمة المرور مطلوبان",
      };
    }
    const allowedRoles = new Set([
      "CASHIER",
      "MANAGER",
      "ADMIN",
      "ACCOUNTANT",
      "DRIVER",
    ]);
    if (!allowedRoles.has(role)) {
      return { ok: false, status: 400, error: "الصلاحية غير صالحة" };
    }
    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username,
        password: hash,
        role: role as never,
        status: "ACTIVE",
        pinCode: String(ctx.body.pinCode ?? "").trim() || null,
      },
      select: { id: true, username: true, role: true, status: true },
    });
    return okOne({ item: user, user }, 201);
  }

  if (ctx.method === "PATCH") {
    const target = String(ctx.body.target ?? "user").toLowerCase();
    if (target === "employee" || target === "staff") {
      const id = Math.floor(num(ctx.body.id ?? ctx.body.employeeId ?? ctx.id, 0));
      if (!id) return { ok: false, status: 400, error: "معرف الموظف مطلوب" };
      const data: Record<string, unknown> = {};
      if (ctx.body.name != null) data.name = String(ctx.body.name).trim();
      if (ctx.body.baseSalary != null || ctx.body.salary != null) {
        data.baseSalary = Math.max(
          0,
          num(ctx.body.baseSalary ?? ctx.body.salary),
        );
      }
      if (ctx.body.isActive != null) data.isActive = Boolean(ctx.body.isActive);
      const employee = await prisma.employee.update({ where: { id }, data });
      return okOne({ item: employee, employee });
    }

    const id = String(ctx.body.id ?? ctx.id ?? "").trim();
    if (!id) return { ok: false, status: 400, error: "معرف المستخدم مطلوب" };
    const data: Record<string, unknown> = {};
    if (ctx.body.role != null) data.role = String(ctx.body.role).toUpperCase();
    if (ctx.body.username != null || ctx.body.name != null) {
      data.username = String(ctx.body.username ?? ctx.body.name).trim();
    }
    if (ctx.body.status != null) {
      data.status =
        String(ctx.body.status).toUpperCase() === "SUSPENDED"
          ? "SUSPENDED"
          : "ACTIVE";
    }
    if (ctx.body.password) {
      data.password = await bcrypt.hash(String(ctx.body.password), 10);
    }
    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, username: true, role: true, status: true },
    });
    return okOne({ item: user, user });
  }

  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

/* ───────────────────────── dispatch ───────────────────────── */

const HANDLERS: Record<
  string,
  (ctx: ModuleContext) => Promise<ModuleResult>
> = {
  dashboard: handleDashboard,
  "low-stock": handleLowStock,
  lowstock: handleLowStock,
  "online-orders": handleOnlineOrders,
  orders: handleOnlineOrders,
  "pos-sales": handlePosSales,
  sales: handlePosSales,
  returns: handleReturns,
  shifts: handleShifts,
  products: handleProducts,
  categories: handleCategories,
  brands: handleBrands,
  purchases: handlePurchases,
  "new-purchase": handlePurchases,
  "purchase-returns": handlePurchaseReturns,
  suppliers: handleSuppliers,
  expenses: handleExpenses,
  drivers: handleDrivers,
  "delivery-zones": handleDeliveryZones,
  zones: handleDeliveryZones,
  coupons: handleCoupons,
  notifications: handleNotifications,
  "customer-chat": handleCustomerChat,
  chat: handleCustomerChat,
  customers: handleCustomers,
  employees: handleEmployees,
  users: handleEmployees,
};

export const MOBILE_ADMIN_MODULES = [
  "dashboard",
  "low-stock",
  "online-orders",
  "pos-sales",
  "returns",
  "shifts",
  "products",
  "categories",
  "brands",
  "purchases",
  "new-purchase",
  "purchase-returns",
  "suppliers",
  "expenses",
  "drivers",
  "delivery-zones",
  "coupons",
  "notifications",
  "customer-chat",
  "customers",
  "employees",
];

export async function dispatchMobileAdminModule(
  moduleName: string,
  ctx: ModuleContext,
): Promise<ModuleResult> {
  const key = moduleName.trim().toLowerCase();
  const handler = HANDLERS[key];
  if (!handler) {
    return {
      ok: false,
      status: 404,
      error: `الوحدة غير معروفة: ${moduleName}. المتاح: ${MOBILE_ADMIN_MODULES.join(", ")}`,
    };
  }
  return handler(ctx);
}
