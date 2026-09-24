import { prisma } from "@/lib/prisma";

export type StockLedgerType =
  | "OPENING"
  | "PURCHASE"
  | "PURCHASE_RETURN"
  | "SALE"
  | "SALE_RETURN"
  | "STAFF_MEAL"
  | "ADJUSTMENT";

export interface StockLedgerMovement {
  id: string;
  occurredAt: string;
  type: StockLedgerType;
  reference: string;
  href: string | null;
  qtyIn: number;
  qtyOut: number;
  /** Piece cost for purchases, selling price for sales. */
  unitAmount: number | null;
  runningBalance: number;
  note: string | null;
}

interface DraftMovement {
  id: string;
  occurredAt: Date;
  type: StockLedgerType;
  reference: string;
  href: string | null;
  qtyIn: number;
  qtyOut: number;
  unitAmount: number | null;
  note: string | null;
}

function saleHref(saleId: string) {
  return `/dashboard/sales?id=${encodeURIComponent(saleId)}`;
}

export async function buildProductStockLedger(productId: string): Promise<{
  product: {
    id: string;
    name: string;
    sku: string | null;
    barcode: string | null;
    stockQuantity: number;
  };
  movements: StockLedgerMovement[];
} | null> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      sku: true,
      barcode: true,
      stockQuantity: true,
      createdAt: true,
    },
  });
  if (!product) return null;

  const [purchases, purchaseReturns, saleLines, adjustments] = await Promise.all([
    prisma.purchaseInvoiceItem.findMany({
      where: { productId },
      include: {
        invoice: {
          select: { id: true, invoiceNumber: true, createdAt: true },
        },
      },
    }),
    prisma.purchaseReturnItem.findMany({
      where: { productId },
      include: {
        return: { select: { id: true, createdAt: true } },
      },
    }),
    prisma.saleLine.findMany({
      where: {
        sale: { status: "completed" },
        OR: [{ productId }, { product: { linkedProductId: productId } }],
      },
      include: {
        sale: {
          select: {
            id: true,
            createdAt: true,
            paymentMethod: true,
            isReturn: true,
            employee: { select: { name: true } },
          },
        },
        product: {
          select: { id: true, linkedProductId: true, bundleMultiplier: true },
        },
      },
    }),
    prisma.adjustmentItem.findMany({
      where: { productId },
      include: {
        adjustment: {
          select: { id: true, type: true, notes: true, createdAt: true },
        },
      },
    }),
  ]);

  const drafts: DraftMovement[] = [];

  for (const line of purchases) {
    drafts.push({
      id: `purchase-${line.id}`,
      occurredAt: line.invoice.createdAt,
      type: "PURCHASE",
      reference: line.invoice.invoiceNumber?.trim()
        ? line.invoice.invoiceNumber.trim()
        : `PI-${line.invoice.id}`,
      href: `/dashboard/purchases/edit/${line.invoice.id}`,
      qtyIn: line.quantity,
      qtyOut: 0,
      unitAmount: line.unitCost,
      note: null,
    });
  }

  for (const line of purchaseReturns) {
    drafts.push({
      id: `purchase-return-${line.id}`,
      occurredAt: line.return.createdAt,
      type: "PURCHASE_RETURN",
      reference: `RTV-${line.return.id}`,
      href: "/dashboard/purchases/returns",
      qtyIn: 0,
      qtyOut: line.quantity,
      unitAmount: line.unitCost,
      note: null,
    });
  }

  for (const line of saleLines) {
    const soldProduct = line.product;
    const isBundleDraw =
      soldProduct?.linkedProductId === productId &&
      soldProduct.id !== productId;
    const isOwnLine = line.productId === productId && !isBundleDraw;
    if (!isBundleDraw && !isOwnLine) continue;
    // A virtual bundle does not keep its own stock.
    if (isOwnLine && soldProduct?.linkedProductId) continue;

    const multiplier = Math.max(
      1,
      Math.floor(Number(soldProduct?.bundleMultiplier) || 1),
    );
    const pieces = isBundleDraw ? line.quantity * multiplier : line.quantity;
    if (pieces <= 0) continue;

    const staffMeal = line.sale.paymentMethod === "STAFF_MEAL";
    const isReturn = line.sale.isReturn && !staffMeal;
    const type: StockLedgerType = staffMeal
      ? "STAFF_MEAL"
      : isReturn
        ? "SALE_RETURN"
        : "SALE";

    drafts.push({
      id: `sale-${line.id}`,
      occurredAt: line.sale.createdAt,
      type,
      reference: line.sale.id.slice(0, 8).toUpperCase(),
      href: saleHref(line.sale.id),
      qtyIn: isReturn ? pieces : 0,
      qtyOut: isReturn ? 0 : pieces,
      unitAmount: line.unitPrice,
      note: staffMeal
        ? line.sale.employee?.name ?? null
        : isBundleDraw
          ? `Bundle ×${multiplier}`
          : null,
    });
  }

  for (const line of adjustments) {
    const delta = line.quantityChange;
    if (delta === 0) continue;
    drafts.push({
      id: `adjustment-${line.id}`,
      occurredAt: line.adjustment.createdAt,
      type: "ADJUSTMENT",
      reference: `ADJ-${line.adjustment.id}`,
      href: "/dashboard/inventory/adjustments",
      qtyIn: delta > 0 ? delta : 0,
      qtyOut: delta < 0 ? Math.abs(delta) : 0,
      unitAmount: line.unitCost,
      note: [line.adjustment.type, line.adjustment.notes]
        .filter(Boolean)
        .join(" · "),
    });
  }

  drafts.sort((a, b) => {
    const time = a.occurredAt.getTime() - b.occurredAt.getTime();
    if (time !== 0) return time;
    return a.id.localeCompare(b.id);
  });

  const net = drafts.reduce((sum, row) => sum + row.qtyIn - row.qtyOut, 0);
  const opening = product.stockQuantity - net;
  if (opening !== 0) {
    const firstAt = drafts[0]?.occurredAt.getTime() ?? product.createdAt.getTime();
    drafts.unshift({
      id: "opening",
      occurredAt: new Date(firstAt - 1000),
      type: "OPENING",
      reference: "Opening",
      href: null,
      qtyIn: opening > 0 ? opening : 0,
      qtyOut: opening < 0 ? Math.abs(opening) : 0,
      unitAmount: null,
      note: "Stock not explained by later movements",
    });
  }

  let balance = 0;
  const chronological: StockLedgerMovement[] = drafts.map((row) => {
    balance += row.qtyIn - row.qtyOut;
    return {
      id: row.id,
      occurredAt: row.occurredAt.toISOString(),
      type: row.type,
      reference: row.reference,
      href: row.href,
      qtyIn: row.qtyIn,
      qtyOut: row.qtyOut,
      unitAmount: row.unitAmount,
      runningBalance: balance,
      note: row.note,
    };
  });

  chronological.reverse();

  return {
    product: {
      id: product.id,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      stockQuantity: product.stockQuantity,
    },
    movements: chronological,
  };
}
