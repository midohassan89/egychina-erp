import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  formatOpeningBalanceDay,
  localOpeningBalanceDay,
  parseOpeningBalanceItems,
  syncOpeningBalanceStock,
} from "@/lib/inventory/openingBalance";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

async function loadId(context: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

/** GET /api/opening-balances/[id] — document for the edit sheet. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = await loadId(context);
  if (!id) {
    return NextResponse.json({ error: "Invalid opening balance" }, { status: 400 });
  }

  const document = await prisma.openingBalance.findUnique({
    where: { id },
    include: {
      items: {
        include: { product: { select: { id: true, name: true } } },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!document) {
    return NextResponse.json({ error: "Opening balance not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: document.id,
    date: formatOpeningBalanceDay(document.date),
    notes: document.notes ?? "",
    items: document.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.product.name,
      packQty: item.packQty,
      packSize: item.packSize,
      looseQty: item.looseQty,
      pieceCost: item.pieceCost,
      totalStock: item.totalStock,
      totalValue: item.totalValue,
    })),
  });
}

/**
 * PUT /api/opening-balances/[id]
 * Applies only the stock difference for each product, and reverses removed lines.
 */
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = await loadId(context);
  if (!id) {
    return NextResponse.json({ error: "Invalid opening balance" }, { status: 400 });
  }

  let body: { date?: string; notes?: string; items?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseOpeningBalanceItems(body.items, { allowEmpty: true });
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const lines = parsed.lines;

  const existing = await prisma.openingBalance.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Opening balance not found" }, { status: 404 });
  }

  const oldByProduct = new Map(existing.items.map((item) => [item.productId, item]));
  const newByProduct = new Map(lines.map((line) => [line.productId, line]));
  const productIds = [...new Set([...oldByProduct.keys(), ...newByProduct.keys()])];

  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      name: true,
      wcId: true,
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
  const date = localOpeningBalanceDay(body.date);

  let stockAfter: { wcId: number; stockQuantity: number }[];
  try {
    stockAfter = await prisma.$transaction(async (tx) => {
      const synced: { wcId: number; stockQuantity: number }[] = [];

      for (const productId of productIds) {
        const product = byId.get(productId);
        if (!product) continue;

        const oldItem = oldByProduct.get(productId);
        const nextLine = newByProduct.get(productId);
        const oldTotal = oldItem?.totalStock ?? 0;
        const newTotal = nextLine?.totalStock ?? 0;
        const stockDelta = newTotal - oldTotal;

        const current = await tx.product.findUnique({
          where: { id: productId },
          select: { stockQuantity: true },
        });
        if (!current) continue;

        const nextStock = current.stockQuantity + stockDelta;
        if (nextStock < 0) {
          throw new Error(
            `Not enough on-hand stock to reduce ${product.name} by ${Math.abs(stockDelta)}`,
          );
        }

        const productData: {
          stockQuantity?: number;
          stockStatus?: string;
          buyingCost?: number;
          purchasePackSize?: number;
        } = {};
        if (stockDelta !== 0) {
          productData.stockQuantity = nextStock;
          productData.stockStatus = nextStock > 0 ? "instock" : "outofstock";
        }
        if (nextLine) {
          productData.buyingCost = nextLine.pieceCost;
          productData.purchasePackSize = nextLine.packSize;
        }
        if (Object.keys(productData).length > 0) {
          await tx.product.update({
            where: { id: productId },
            data: productData,
          });
        }

        if (stockDelta !== 0) {
          synced.push({ wcId: product.wcId, stockQuantity: nextStock });
        }

        if (oldItem && nextLine) {
          await tx.openingBalanceItem.update({
            where: { id: oldItem.id },
            data: {
              packQty: nextLine.packQty,
              packSize: nextLine.packSize,
              looseQty: nextLine.looseQty,
              pieceCost: nextLine.pieceCost,
              totalStock: nextLine.totalStock,
              totalValue: nextLine.totalValue,
            },
          });
        } else if (nextLine) {
          await tx.openingBalanceItem.create({
            data: {
              openingBalanceId: id,
              productId,
              packQty: nextLine.packQty,
              packSize: nextLine.packSize,
              looseQty: nextLine.looseQty,
              pieceCost: nextLine.pieceCost,
              totalStock: nextLine.totalStock,
              totalValue: nextLine.totalValue,
            },
          });
        } else if (oldItem) {
          await tx.openingBalanceItem.delete({ where: { id: oldItem.id } });
        }
      }

      await tx.openingBalance.update({
        where: { id },
        data: { date, notes },
      });

      return synced;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update opening balance";
    if (message.startsWith("Not enough on-hand stock")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    throw error;
  }

  const wooError = await syncOpeningBalanceStock(stockAfter);
  return NextResponse.json({ id, wooError });
}
