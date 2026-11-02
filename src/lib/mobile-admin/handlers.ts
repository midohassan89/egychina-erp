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
  | { ok: true; status?: number; data: Record<string, unknown> }
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

async function handleDashboard(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method !== "GET") {
    return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
  }
  const since = startOfToday();

  const [
    posSales,
    posReturns,
    onlineOrders,
    pendingOnline,
    expensesToday,
    outOfStock,
    criticalStock,
  ] = await Promise.all([
    prisma.sale.aggregate({
      where: {
        isReturn: false,
        createdAt: { gte: since },
        status: "completed",
      },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.sale.aggregate({
      where: {
        isReturn: true,
        createdAt: { gte: since },
      },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: {
        createdAt: { gte: since },
        status: { notIn: ["CANCELLED"] },
      },
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
      where: {
        isDeleted: false,
        stockQuantity: { gt: 0, lte: 5 },
      },
    }),
  ]);

  const posRevenue = Math.abs(posSales._sum.total ?? 0);
  const onlineRevenue = onlineOrders._sum.totalAmount ?? 0;
  const returnsValue = Math.abs(posReturns._sum.total ?? 0);

  return {
    ok: true,
    data: {
      todaySalesTotal: roundMoney(posRevenue + onlineRevenue),
      posSalesTotal: roundMoney(posRevenue),
      onlineSalesTotal: roundMoney(onlineRevenue),
      invoicesCount: (posSales._count._all ?? 0) + (onlineOrders._count._all ?? 0),
      posInvoicesCount: posSales._count._all ?? 0,
      onlineOrdersCount: onlineOrders._count._all ?? 0,
      returnsTotal: roundMoney(returnsValue),
      returnsCount: posReturns._count._all ?? 0,
      expensesTotal: roundMoney(expensesToday._sum.amount ?? 0),
      expensesCount: expensesToday._count._all ?? 0,
      pendingOnlineOrders: pendingOnline,
      outOfStockCount: outOfStock,
      criticalStockCount: criticalStock,
    },
  };
}

async function handleLowStock(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method === "GET") {
    const threshold = Math.max(1, Math.floor(num(q(ctx.searchParams, "threshold"), 5)));
    const products = await prisma.product.findMany({
      where: {
        isDeleted: false,
        stockQuantity: { lte: threshold },
      },
      orderBy: [{ stockQuantity: "asc" }, { name: "asc" }],
      take: 200,
      select: {
        id: true,
        name: true,
        barcode: true,
        sku: true,
        stockQuantity: true,
        price: true,
        salePrice: true,
        isActive: true,
        category: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
      },
    });
    return {
      ok: true,
      data: {
        threshold,
        products: products.map((p) => ({
          ...p,
          level: p.stockQuantity <= 0 ? "OUT" : "CRITICAL",
        })),
        count: products.length,
      },
    };
  }

  if (ctx.method === "PATCH") {
    const productId = String(ctx.body.productId ?? ctx.id ?? "").trim();
    const stockQuantity = num(ctx.body.stockQuantity, NaN);
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
      select: {
        id: true,
        name: true,
        stockQuantity: true,
        stockStatus: true,
      },
    });
    return { ok: true, data: { product } };
  }

  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

async function handleOnlineOrders(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method === "GET") {
    const statusRaw = q(ctx.searchParams, "status");
    const status = statusRaw ? mapMobileOrderStatus(statusRaw) : null;
    if (statusRaw && !status) {
      return { ok: false, status: 400, error: "حالة الطلب غير صالحة" };
    }
    const take = Math.min(100, Math.max(1, Math.floor(num(q(ctx.searchParams, "limit"), 50))));
    const orders = await prisma.order.findMany({
      where: status ? { status: status as never } : undefined,
      orderBy: { createdAt: "desc" },
      take,
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, barcode: true } },
          },
        },
        assignedDriver: { select: { id: true, username: true } },
        deliveryZone: { select: { id: true, nameAr: true, deliveryFee: true } },
      },
    });
    return { ok: true, data: { orders, count: orders.length } };
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

    if ("assignedDriverId" in ctx.body) {
      const driverId =
        ctx.body.assignedDriverId == null || ctx.body.assignedDriverId === ""
          ? null
          : String(ctx.body.assignedDriverId);
      if (driverId) {
        const driver = await prisma.user.findFirst({
          where: { id: driverId, role: "DRIVER", status: "ACTIVE" },
        });
        if (!driver) {
          return { ok: false, status: 400, error: "السائق غير موجود أو غير نشط" };
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
          assignedDriver: { select: { id: true, username: true } },
        },
      });
    });

    return { ok: true, data: { order: updated } };
  }

  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

async function handlePosSales(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method === "GET") {
    const isReturn = q(ctx.searchParams, "isReturn");
    const take = Math.min(100, Math.max(1, Math.floor(num(q(ctx.searchParams, "limit"), 50))));
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
    return { ok: true, data: { sales, count: sales.length } };
  }

  if (ctx.method === "POST") {
    // Partial/full return against an existing sale
    const saleId = String(ctx.body.saleId ?? "").trim();
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
              stockMultiplier: Math.max(1, Math.floor(num(row.stockMultiplier, 1))),
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
      // Restock returned quantities (POS returns add inventory back).
      for (const line of returnLines) {
        const wcId = Number(line.wcProductId);
        if (!Number.isFinite(wcId) || wcId <= 0) continue;
        const product = await tx.product.findFirst({
          where: { wcId, isDeleted: false },
          select: { id: true, stockQuantity: true },
        });
        if (!product) continue;
        const addQty =
          Math.abs(line.quantity) *
          Math.max(1, Math.floor(line.stockMultiplier || 1));
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

    return {
      ok: true,
      data: {
        sale,
        invoiceNumber: sale.orderNumber,
        originalSaleId: original.id,
      },
    };
  }

  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

async function handleShifts(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method === "GET") {
    const status = q(ctx.searchParams, "status");
    const shifts = await prisma.shift.findMany({
      where: status ? { status: status.toUpperCase() } : undefined,
      orderBy: { startTime: "desc" },
      take: 100,
      include: { user: { select: { id: true, username: true } } },
    });
    return { ok: true, data: { shifts, count: shifts.length } };
  }

  if (ctx.method === "PATCH") {
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
    return { ok: true, data: { shift: closed } };
  }

  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

async function handleProducts(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method === "GET") {
    const search = q(ctx.searchParams, "q") || q(ctx.searchParams, "search");
    const take = Math.min(100, Math.max(1, Math.floor(num(q(ctx.searchParams, "limit"), 50))));
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
    return { ok: true, data: { products, count: products.length } };
  }

  if (ctx.method === "POST") {
    const name = String(ctx.body.name ?? "").trim();
    if (!name) {
      return { ok: false, status: 400, error: "اسم المنتج مطلوب" };
    }
    const price = Math.max(0, num(ctx.body.price, 0));
    const stockQuantity = Math.max(0, num(ctx.body.stockQuantity, 0));
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
        wcId: -Math.abs(Number(`${Date.now()}${Math.floor(Math.random() * 1000)}`) % 2_000_000_000),
      },
    });
    return { ok: true, status: 201, data: { product } };
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
    if (ctx.body.stockQuantity != null) {
      const qty = num(ctx.body.stockQuantity);
      data.stockQuantity = qty;
      data.stockStatus = qty > 0 ? "instock" : "outofstock";
    }
    if (ctx.body.isActive != null) data.isActive = Boolean(ctx.body.isActive);
    if (ctx.body.barcode != null) data.barcode = String(ctx.body.barcode).trim();
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
    return { ok: true, data: { product } };
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
    return { ok: true, data: { product, deleted: true } };
  }

  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

async function handleCategories(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method === "GET") {
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { products: true } } },
    });
    return { ok: true, data: { categories, count: categories.length } };
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
      },
    });
    return { ok: true, status: 201, data: { category } };
  }
  if (ctx.method === "PATCH") {
    const id = String(ctx.body.id ?? ctx.id ?? "").trim();
    if (!id) return { ok: false, status: 400, error: "معرف القسم مطلوب" };
    const data: Record<string, unknown> = {};
    if (ctx.body.name != null) data.name = String(ctx.body.name).trim();
    if (ctx.body.nameEn != null) data.nameEn = String(ctx.body.nameEn).trim() || null;
    if (ctx.body.nameZh != null) data.nameZh = String(ctx.body.nameZh).trim() || null;
    if (ctx.body.description != null) {
      data.description = String(ctx.body.description).trim() || null;
    }
    const category = await prisma.category.update({ where: { id }, data });
    return { ok: true, data: { category } };
  }
  if (ctx.method === "DELETE") {
    const id = String(ctx.body.id ?? ctx.id ?? "").trim();
    if (!id) return { ok: false, status: 400, error: "معرف القسم مطلوب" };
    await prisma.category.delete({ where: { id } });
    return { ok: true, data: { deleted: true, id } };
  }
  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

async function handleBrands(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method === "GET") {
    const brands = await prisma.brand.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { products: true } } },
    });
    return { ok: true, data: { brands, count: brands.length } };
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
    return { ok: true, status: 201, data: { brand } };
  }
  if (ctx.method === "PATCH") {
    const id = String(ctx.body.id ?? ctx.id ?? "").trim();
    if (!id) return { ok: false, status: 400, error: "معرف العلامة مطلوب" };
    const data: Record<string, unknown> = {};
    if (ctx.body.name != null) data.name = String(ctx.body.name).trim();
    if (ctx.body.nameEn != null) data.nameEn = String(ctx.body.nameEn).trim() || null;
    if (ctx.body.nameZh != null) data.nameZh = String(ctx.body.nameZh).trim() || null;
    if (ctx.body.image != null) data.image = String(ctx.body.image).trim() || null;
    const brand = await prisma.brand.update({ where: { id }, data });
    return { ok: true, data: { brand } };
  }
  if (ctx.method === "DELETE") {
    const id = String(ctx.body.id ?? ctx.id ?? "").trim();
    if (!id) return { ok: false, status: 400, error: "معرف العلامة مطلوب" };
    await prisma.brand.delete({ where: { id } });
    return { ok: true, data: { deleted: true, id } };
  }
  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

async function handlePurchases(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method === "GET") {
    const invoices = await prisma.purchaseInvoice.findMany({
      orderBy: { date: "desc" },
      take: 100,
      include: {
        supplier: { select: { id: true, name: true, phone: true } },
        items: { include: { product: { select: { id: true, name: true } } } },
      },
    });
    return { ok: true, data: { invoices, count: invoices.length } };
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
      return { ok: true, status: 201, data: { invoice } };
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
        items: { include: { product: { select: { id: true, name: true } } } },
      },
    });
    return { ok: true, data: { returns, count: returns.length } };
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
      return { ok: true, status: 201, data: { purchaseReturn } };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "تعذر إنشاء مرتجع المشتريات";
      return { ok: false, status: 400, error: message };
    }
  }
  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

async function handleSuppliers(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method === "GET") {
    const suppliers = await prisma.supplier.findMany({
      orderBy: { name: "asc" },
    });
    return { ok: true, data: { suppliers, count: suppliers.length } };
  }
  if (ctx.method === "POST") {
    const name = String(ctx.body.name ?? "").trim();
    if (!name) return { ok: false, status: 400, error: "اسم المورد مطلوب" };
    const action = String(ctx.body.action ?? "create").trim().toLowerCase();

    if (action === "pay") {
      const supplierId = Math.floor(num(ctx.body.supplierId ?? ctx.body.id, 0));
      const amount = Math.abs(num(ctx.body.amount, 0));
      if (!supplierId || amount <= 0) {
        return { ok: false, status: 400, error: "supplierId والمبلغ مطلوبان" };
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
      return { ok: true, data: payment };
    }

    const supplier = await prisma.supplier.create({
      data: {
        name,
        phone: String(ctx.body.phone ?? "").trim() || null,
        openingBalance: Math.max(0, num(ctx.body.openingBalance, 0)),
        balance: Math.max(0, num(ctx.body.balance ?? ctx.body.openingBalance, 0)),
      },
    });
    return { ok: true, status: 201, data: { supplier } };
  }
  if (ctx.method === "PATCH") {
    const id = Math.floor(num(ctx.body.id ?? ctx.id, 0));
    if (!id) return { ok: false, status: 400, error: "معرف المورد مطلوب" };
    const data: Record<string, unknown> = {};
    if (ctx.body.name != null) data.name = String(ctx.body.name).trim();
    if (ctx.body.phone != null) data.phone = String(ctx.body.phone).trim() || null;
    const supplier = await prisma.supplier.update({ where: { id }, data });
    return { ok: true, data: { supplier } };
  }
  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

async function handleExpenses(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method === "GET") {
    const expenses = await prisma.expense.findMany({
      orderBy: { date: "desc" },
      take: 100,
      include: { category: true },
    });
    return { ok: true, data: { expenses, count: expenses.length } };
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
      return { ok: true, status: 201, data: { expense } };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "تعذر تسجيل المصروف";
      return { ok: false, status: 400, error: message };
    }
  }
  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

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
          where: { status: { in: ["PENDING", "CONFIRMED", "PREPARING", "SHIPPED"] } },
          select: { id: true, orderNumber: true, status: true, customerName: true },
          take: 20,
        },
      },
    });
    const drivers = rows.map((d) => ({ ...d, phone: d.username }));
    return { ok: true, data: { drivers, count: drivers.length } };
  }
  if (ctx.method === "POST") {
    // User schema has no phone column — store phone as username when provided.
    const username = String(
      ctx.body.username ?? ctx.body.phone ?? ctx.body.name ?? "",
    ).trim();
    const password = String(ctx.body.password ?? "").trim();
    if (!username || !password) {
      return { ok: false, status: 400, error: "اسم المستخدم وكلمة المرور مطلوبان" };
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
    return {
      ok: true,
      status: 201,
      data: { driver: { ...driver, phone: driver.username } },
    };
  }
  if (ctx.method === "PATCH") {
    const id = String(ctx.body.id ?? ctx.id ?? "").trim();
    if (!id) return { ok: false, status: 400, error: "معرف السائق مطلوب" };
    const data: Record<string, unknown> = {};
    if (ctx.body.username != null) {
      data.username = String(ctx.body.username).trim();
    } else if (ctx.body.phone != null) {
      data.username = String(ctx.body.phone).trim();
    }
    if (ctx.body.status != null) {
      data.status = String(ctx.body.status).toUpperCase() === "SUSPENDED"
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
    return {
      ok: true,
      data: { driver: { ...driver, phone: driver.username } },
    };
  }
  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

async function handleDeliveryZones(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method === "GET") {
    const zones = await prisma.deliveryZone.findMany({
      orderBy: { nameAr: "asc" },
    });
    return { ok: true, data: { zones, count: zones.length } };
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
    return { ok: true, status: 201, data: { zone } };
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
    if (ctx.body.minOrder != null) data.minOrder = Math.max(0, num(ctx.body.minOrder));
    if (ctx.body.isActive != null) data.isActive = Boolean(ctx.body.isActive);
    const zone = await prisma.deliveryZone.update({ where: { id }, data });
    return { ok: true, data: { zone } };
  }
  if (ctx.method === "DELETE") {
    const id = String(ctx.body.id ?? ctx.id ?? "").trim();
    if (!id) return { ok: false, status: 400, error: "معرف المنطقة مطلوب" };
    await prisma.deliveryZone.delete({ where: { id } });
    return { ok: true, data: { deleted: true, id } };
  }
  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

async function handleCoupons(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method === "GET") {
    const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } });
    return { ok: true, data: { coupons, count: coupons.length } };
  }
  if (ctx.method === "POST") {
    const code = String(ctx.body.code ?? "").trim().toUpperCase();
    if (!code) return { ok: false, status: 400, error: "كود الخصم مطلوب" };
    const coupon = await prisma.coupon.create({
      data: {
        code,
        discountType:
          String(ctx.body.discountType ?? "PERCENTAGE").toUpperCase() === "FIXED"
            ? "FIXED"
            : "PERCENTAGE",
        discountValue: Math.max(0, num(ctx.body.discountValue, 0)),
        minOrder: Math.max(0, num(ctx.body.minOrder, 0)),
        maxDiscount:
          ctx.body.maxDiscount != null ? num(ctx.body.maxDiscount) : null,
        usageLimit:
          ctx.body.usageLimit != null ? Math.floor(num(ctx.body.usageLimit)) : null,
        expiresAt: ctx.body.expiresAt
          ? new Date(String(ctx.body.expiresAt))
          : null,
        isActive: ctx.body.isActive === false ? false : true,
      },
    });
    return { ok: true, status: 201, data: { coupon } };
  }
  if (ctx.method === "PATCH") {
    const id = String(ctx.body.id ?? ctx.id ?? "").trim();
    if (!id) return { ok: false, status: 400, error: "معرف الكوبون مطلوب" };
    const data: Record<string, unknown> = {};
    if (ctx.body.code != null) data.code = String(ctx.body.code).trim().toUpperCase();
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
    return { ok: true, data: { coupon } };
  }
  if (ctx.method === "DELETE") {
    const id = String(ctx.body.id ?? ctx.id ?? "").trim();
    if (!id) return { ok: false, status: 400, error: "معرف الكوبون مطلوب" };
    await prisma.coupon.delete({ where: { id } });
    return { ok: true, data: { deleted: true, id } };
  }
  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

async function handleNotifications(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method === "GET") {
    const notifications = await prisma.customerNotification.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { ok: true, data: { notifications, count: notifications.length } };
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
    return { ok: true, status: 201, data: { notification } };
  }
  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

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
    return { ok: true, data: { messages, count: messages.length } };
  }
  if (ctx.method === "POST") {
    const customerId = String(ctx.body.customerId ?? "").trim();
    const text = String(ctx.body.text ?? ctx.body.message ?? "").trim();
    if (!customerId || !text) {
      return { ok: false, status: 400, error: "customerId ونص الرسالة مطلوبان" };
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
    return { ok: true, status: 201, data: { message } };
  }
  if (ctx.method === "PATCH") {
    // mark read
    const id = String(ctx.body.id ?? ctx.id ?? "").trim();
    if (!id) return { ok: false, status: 400, error: "معرف الرسالة مطلوب" };
    const message = await prisma.chatMessage.update({
      where: { id },
      data: { isReadByAdmin: true },
    });
    return { ok: true, data: { message } };
  }
  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

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
      },
    });
    return { ok: true, data: { customers, count: customers.length } };
  }
  if (ctx.method === "PATCH") {
    const id = String(ctx.body.id ?? ctx.id ?? "").trim();
    if (!id) return { ok: false, status: 400, error: "معرف العميل مطلوب" };
    const data: Record<string, unknown> = {};
    if (ctx.body.name != null) data.name = String(ctx.body.name).trim() || null;
    if (ctx.body.phone != null) data.phone = String(ctx.body.phone).trim();
    if (ctx.body.pointsBalance != null) {
      data.pointsBalance = Math.max(0, Math.floor(num(ctx.body.pointsBalance)));
    }
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
      return { ok: true, data: { customer } };
    }
    const customer = await prisma.customer.update({
      where: { id },
      data,
      select: { id: true, name: true, phone: true, pointsBalance: true },
    });
    return { ok: true, data: { customer } };
  }
  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

async function handleEmployees(ctx: ModuleContext): Promise<ModuleResult> {
  if (ctx.method === "GET") {
    const kind = q(ctx.searchParams, "kind"); // users | staff
    if (kind === "users" || kind === "cashiers") {
      const users = await prisma.user.findMany({
        where: { role: { in: ["CASHIER", "MANAGER", "ADMIN", "ACCOUNTANT"] } },
        orderBy: { username: "asc" },
        select: {
          id: true,
          username: true,
          role: true,
          status: true,
          createdAt: true,
        },
      });
      return { ok: true, data: { users, count: users.length } };
    }
    const employees = await prisma.employee.findMany({
      orderBy: { name: "asc" },
      include: {
        transactions: { orderBy: { date: "desc" }, take: 5 },
      },
    });
    return { ok: true, data: { employees, count: employees.length } };
  }

  if (ctx.method === "POST") {
    const action = String(ctx.body.action ?? "create").trim().toLowerCase();

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
      return { ok: true, status: 201, data: { transaction } };
    }

    if (action === "user" || ctx.body.role) {
      const username = String(ctx.body.username ?? "").trim();
      const password = String(ctx.body.password ?? "").trim();
      const role = String(ctx.body.role ?? "CASHIER").trim().toUpperCase();
      if (!username || !password) {
        return { ok: false, status: 400, error: "اسم المستخدم وكلمة المرور مطلوبان" };
      }
      const allowedRoles = new Set([
        "CASHIER",
        "MANAGER",
        "ADMIN",
        "ACCOUNTANT",
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
      return { ok: true, status: 201, data: { user } };
    }

    const name = String(ctx.body.name ?? "").trim();
    if (!name) return { ok: false, status: 400, error: "اسم الموظف مطلوب" };
    const employee = await prisma.employee.create({
      data: {
        name,
        baseSalary: Math.max(0, num(ctx.body.baseSalary ?? ctx.body.salary, 0)),
        isActive: ctx.body.isActive === false ? false : true,
        hireDate: ctx.body.hireDate
          ? new Date(String(ctx.body.hireDate))
          : new Date(),
      },
    });
    return { ok: true, status: 201, data: { employee } };
  }

  if (ctx.method === "PATCH") {
    const target = String(ctx.body.target ?? "employee").toLowerCase();
    if (target === "user") {
      const id = String(ctx.body.id ?? ctx.id ?? "").trim();
      if (!id) return { ok: false, status: 400, error: "معرف المستخدم مطلوب" };
      const data: Record<string, unknown> = {};
      if (ctx.body.role != null) data.role = String(ctx.body.role).toUpperCase();
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
      return { ok: true, data: { user } };
    }

    const id = Math.floor(num(ctx.body.id ?? ctx.id, 0));
    if (!id) return { ok: false, status: 400, error: "معرف الموظف مطلوب" };
    const data: Record<string, unknown> = {};
    if (ctx.body.name != null) data.name = String(ctx.body.name).trim();
    if (ctx.body.baseSalary != null || ctx.body.salary != null) {
      data.baseSalary = Math.max(0, num(ctx.body.baseSalary ?? ctx.body.salary));
    }
    if (ctx.body.isActive != null) data.isActive = Boolean(ctx.body.isActive);
    const employee = await prisma.employee.update({ where: { id }, data });
    return { ok: true, data: { employee } };
  }

  return { ok: false, status: 405, error: "الطريقة غير مدعومة" };
}

const HANDLERS: Record<
  string,
  (ctx: ModuleContext) => Promise<ModuleResult>
> = {
  dashboard: handleDashboard,
  "low-stock": handleLowStock,
  "online-orders": handleOnlineOrders,
  "pos-sales": handlePosSales,
  shifts: handleShifts,
  products: handleProducts,
  categories: handleCategories,
  brands: handleBrands,
  purchases: handlePurchases,
  "purchase-returns": handlePurchaseReturns,
  suppliers: handleSuppliers,
  expenses: handleExpenses,
  drivers: handleDrivers,
  "delivery-zones": handleDeliveryZones,
  coupons: handleCoupons,
  notifications: handleNotifications,
  "customer-chat": handleCustomerChat,
  customers: handleCustomers,
  employees: handleEmployees,
};

export const MOBILE_ADMIN_MODULES = Object.keys(HANDLERS);

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
