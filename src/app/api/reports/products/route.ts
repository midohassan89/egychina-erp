import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveReportPeriod } from "@/lib/reports/period";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

const LOW_STOCK_THRESHOLD = 5;

/**
 * GET /api/reports/products?startDate=&endDate=
 * Top 10 bestsellers (period) + low stock alerts.
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
  const { start, end } = resolveReportPeriod(
    searchParams.get("startDate"),
    searchParams.get("endDate"),
  );

  const sales = await prisma.sale.findMany({
    where: {
      status: "completed",
      createdAt: { gte: start, lte: end },
      isReturn: false,
    },
    include: {
      lines: {
        select: {
          productId: true,
          wcProductId: true,
          name: true,
          quantity: true,
        },
      },
    },
  });

  const qtyByKey = new Map<
    string,
    { productId: string | null; wcProductId: number | null; name: string; qty: number }
  >();

  for (const sale of sales) {
    for (const line of sale.lines) {
      const key =
        line.productId ??
        (line.wcProductId != null ? `wc:${line.wcProductId}` : `name:${line.name}`);
      const prev = qtyByKey.get(key);
      if (prev) {
        prev.qty += line.quantity;
      } else {
        qtyByKey.set(key, {
          productId: line.productId,
          wcProductId: line.wcProductId,
          name: line.name,
          qty: line.quantity,
        });
      }
    }
  }

  const topSellers = [...qtyByKey.values()]
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10)
    .map((row) => ({
      productId: row.productId,
      wcProductId: row.wcProductId,
      name: row.name,
      quantitySold: row.qty,
    }));

  const lowStock = await prisma.product.findMany({
    where: {
      isDeleted: false,
      stockQuantity: { lte: LOW_STOCK_THRESHOLD },
    },
    orderBy: [{ stockQuantity: "asc" }, { name: "asc" }],
    take: 50,
    select: {
      id: true,
      wcId: true,
      name: true,
      sku: true,
      barcode: true,
      stockQuantity: true,
    },
  });

  return NextResponse.json({
    period: {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    },
    topSellers,
    lowStock: lowStock.map((p) => ({
      id: p.id,
      wcId: p.wcId,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      stockQuantity: p.stockQuantity,
      threshold: LOW_STOCK_THRESHOLD,
    })),
  });
}
