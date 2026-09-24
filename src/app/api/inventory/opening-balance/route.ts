import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { roundMoney } from "@/lib/pos/money";
import { wooCommerceFetch, WooCommerceError } from "@/lib/woocommerce/client";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

interface IncomingLine {
  productId?: string;
  packQty?: number;
  packSize?: number;
  looseQty?: number;
  pieceCost?: number;
}

function whole(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : 0;
}

function localDay(value: unknown): Date {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** POST /api/inventory/opening-balance — initial stock receipt. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { date?: string; notes?: string; items?: IncomingLine[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length === 0) {
    return NextResponse.json({ error: "Add at least one product" }, { status: 400 });
  }

  const lines: {
    productId: string;
    packQty: number;
    packSize: number;
    looseQty: number;
    pieceCost: number;
    totalStock: number;
    totalValue: number;
  }[] = [];

  const seen = new Set<string>();
  for (const row of rawItems) {
    const productId = row.productId?.trim() ?? "";
    if (!productId) {
      return NextResponse.json({ error: "Each line needs a product" }, { status: 400 });
    }
    if (seen.has(productId)) {
      return NextResponse.json(
        { error: "Each product can appear once on an opening balance" },
        { status: 400 },
      );
    }
    seen.add(productId);

    const packQty = whole(row.packQty);
    const packSize = whole(row.packSize);
    const looseQty = whole(row.looseQty);
    const pieceCost = Number(row.pieceCost);
    if (packQty < 0 || looseQty < 0 || packSize < 1) {
      return NextResponse.json(
        { error: "Pack quantity and loose quantity must be zero or more, and pack size at least 1" },
        { status: 400 },
      );
    }
    if (!Number.isFinite(pieceCost) || pieceCost < 0) {
      return NextResponse.json({ error: "Piece cost must be zero or more" }, { status: 400 });
    }
    const totalStock = packQty * packSize + looseQty;
    if (totalStock <= 0) {
      return NextResponse.json(
        { error: "Each line needs cartons or loose pieces" },
        { status: 400 },
      );
    }
    lines.push({
      productId,
      packQty,
      packSize,
      looseQty,
      pieceCost: roundMoney(pieceCost),
      totalStock,
      totalValue: roundMoney(totalStock * pieceCost),
    });
  }

  const products = await prisma.product.findMany({
    where: { id: { in: lines.map((line) => line.productId) }, isDeleted: false },
    select: {
      id: true,
      name: true,
      wcId: true,
      stockQuantity: true,
      linkedProductId: true,
    },
  });
  const byId = new Map(products.map((product) => [product.id, product]));
  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product) {
      return NextResponse.json({ error: "A product on this sheet was not found" }, { status: 400 });
    }
    if (product.linkedProductId) {
      return NextResponse.json(
        { error: `${product.name} is a virtual bundle and does not hold its own stock` },
        { status: 400 },
      );
    }
  }

  const notes = body.notes?.trim() || null;
  const date = localDay(body.date);

  const created = await prisma.$transaction(async (tx) => {
    const header = await tx.openingBalance.create({
      data: {
        date,
        notes,
        items: {
          create: lines.map((line) => ({
            productId: line.productId,
            packQty: line.packQty,
            packSize: line.packSize,
            looseQty: line.looseQty,
            pieceCost: line.pieceCost,
            totalStock: line.totalStock,
            totalValue: line.totalValue,
          })),
        },
      },
    });

    const stockAfter: { wcId: number; stockQuantity: number }[] = [];
    for (const line of lines) {
      const product = byId.get(line.productId)!;
      const nextStock = product.stockQuantity + line.totalStock;
      await tx.product.update({
        where: { id: product.id },
        data: {
          stockQuantity: nextStock,
          stockStatus: nextStock > 0 ? "instock" : "outofstock",
          buyingCost: line.pieceCost,
          purchasePackSize: line.packSize,
        },
      });
      stockAfter.push({ wcId: product.wcId, stockQuantity: nextStock });
    }

    return { id: header.id, stockAfter };
  });

  let wooError: string | null = null;
  const wooUpdates = created.stockAfter.map((row) => ({
    id: row.wcId,
    stock_quantity: row.stockQuantity,
    manage_stock: true,
    stock_status: row.stockQuantity > 0 ? "instock" : "outofstock",
  }));

  for (let i = 0; i < wooUpdates.length; i += 100) {
    const chunk = wooUpdates.slice(i, i + 100);
    try {
      await wooCommerceFetch("products/batch", {
        method: "POST",
        body: { update: chunk },
      });
    } catch (error) {
      wooError =
        error instanceof WooCommerceError
          ? error.message
          : "WooCommerce stock sync failed";
      break;
    }
  }

  return NextResponse.json({
    id: created.id,
    wooError,
  });
}
