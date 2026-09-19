import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  mapSaleToDetail,
  mapSaleToHistoryRow,
  mapSaleToLocalSale,
} from "@/lib/orders/mapSale";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

/**
 * GET /api/orders/history
 * Paginated POS sales (Prisma Sale) with cashier + line items.
 * Query: page, perPage, paymentMethod, startDate, endDate, isReturn, q, id
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim() ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const perPageRaw = Number(searchParams.get("perPage") ?? 20);
  const perPage = Math.min(100, Math.max(1, Number.isFinite(perPageRaw) ? perPageRaw : 20));
  const paymentMethod = searchParams.get("paymentMethod")?.trim() ?? "";
  const startDate = searchParams.get("startDate")?.trim() ?? "";
  const endDate = searchParams.get("endDate")?.trim() ?? "";
  const isReturnParam = searchParams.get("isReturn")?.trim() ?? "";
  const q = searchParams.get("q")?.trim() ?? "";

  // Single order detail (+ LocalSale shape for reprint)
  if (id) {
    const sale = await prisma.sale.findUnique({
      where: { id },
      include: {
        lines: { orderBy: { id: "asc" } },
        user: { select: { id: true, username: true } },
      },
    });
    if (!sale) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    return NextResponse.json({
      order: mapSaleToDetail(sale),
      localSale: mapSaleToLocalSale(sale),
    });
  }

  const filters: Prisma.SaleWhereInput[] = [{ status: "completed" }];

  if (paymentMethod) {
    filters.push({ paymentMethod });
  }

  if (isReturnParam === "1" || isReturnParam === "true") {
    filters.push({ isReturn: true });
  } else if (isReturnParam === "0" || isReturnParam === "false") {
    filters.push({ isReturn: false });
  }

  if (startDate || endDate) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (startDate) {
      const start = new Date(startDate);
      if (/^\d{4}-\d{2}-\d{2}$/.test(startDate)) start.setHours(0, 0, 0, 0);
      if (!Number.isNaN(start.getTime())) createdAt.gte = start;
    }
    if (endDate) {
      const end = new Date(endDate);
      if (/^\d{4}-\d{2}-\d{2}$/.test(endDate)) end.setHours(23, 59, 59, 999);
      if (!Number.isNaN(end.getTime())) createdAt.lte = end;
    }
    if (createdAt.gte || createdAt.lte) {
      filters.push({ createdAt });
    }
  }

  if (q) {
    filters.push({
      OR: [
        { id: { contains: q } },
        { localId: { contains: q } },
        { customerName: { contains: q } },
        { user: { username: { contains: q } } },
        ...(Number.isFinite(Number(q)) && Number(q) > 0
          ? [{ wooOrderId: Number(q) }]
          : []),
      ],
    });
  }

  const where: Prisma.SaleWhereInput = { AND: filters };

  const [total, rows] = await Promise.all([
    prisma.sale.count({ where }),
    prisma.sale.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        lines: { orderBy: { id: "asc" } },
        user: { select: { id: true, username: true } },
      },
    }),
  ]);

  return NextResponse.json({
    orders: rows.map(mapSaleToHistoryRow),
    total,
    page,
    perPage,
    pageCount: Math.max(1, Math.ceil(total / perPage)),
  });
}
