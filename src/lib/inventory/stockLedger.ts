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
  /** Supplier, employee, or retail customer. */
  party: string | null;
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
  party: string | null;
  qtyIn: number;
  qtyOut: number;
  unitAmount: number | null;
  note: string | null;
}

function saleHref(saleId: string) {
  return `/dashboard/sales?id=${encodeURIComponent(saleId)}`;
}

export async function buildProductStockLedger(
  productId: string,
  range?: { start?: Date | null; end?: Date | null },
): Promise<{
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
          select: {
            id: true,
            invoiceNumber: true,
            createdAt: true,
            supplier: { select: { name: true } },
          },
        },
      },
    }),
    prisma.purchaseReturnItem.findMany({
      where: { productId },
      include: {
        return: {
          select: {
            id: true,
            createdAt: true,
            supplier: { select: { name: true } },
          },
        },
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
      party: line.invoice.supplier.name,
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
      party: line.return.supplier.name,
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
      party: staffMeal
        ? line.sale.employee?.name ?? null
        : "Retail Customer",
      qtyIn: isReturn ? pieces : 0,
      qtyOut: isReturn ? 0 : pieces,
      unitAmount: line.unitPrice,
      note: isBundleDraw ? `Bundle ×${multiplier}` : null,
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
      party: null,
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

  const start = range?.start ?? null;
  const end = range?.end ?? null;
  const inPeriod = (at: Date) => {
    if (start && at < start) return false;
    if (end && at > end) return false;
    return true;
  };

  const prior = start ? drafts.filter((row) => row.occurredAt < start) : [];
  const period = drafts.filter((row) => inPeriod(row.occurredAt));

  const netAll = drafts.reduce((sum, row) => sum + row.qtyIn - row.qtyOut, 0);
  const priorNet = prior.reduce((sum, row) => sum + row.qtyIn - row.qtyOut, 0);
  const unexplained = product.stockQuantity - netAll;
  const openingBalance = start ? unexplained + priorNet : unexplained;

  const showOpening = Boolean(start) || openingBalance !== 0;
  const openingAt = start ?? new Date((period[0]?.occurredAt.getTime() ?? product.createdAt.getTime()) - 1000);

  let balance = showOpening ? openingBalance : 0;
  const chronological: StockLedgerMovement[] = [];

  if (showOpening) {
    chronological.push({
      id: "opening",
      occurredAt: openingAt.toISOString(),
      type: "OPENING",
      reference: "الرصيد الافتتاحي",
      href: null,
      party: null,
      qtyIn: 0,
      qtyOut: 0,
      unitAmount: null,
      runningBalance: openingBalance,
      note: null,
    });
  }

  for (const row of period) {
    balance += row.qtyIn - row.qtyOut;
    chronological.push({
      id: row.id,
      occurredAt: row.occurredAt.toISOString(),
      type: row.type,
      reference: row.reference,
      href: row.href,
      party: row.party,
      qtyIn: row.qtyIn,
      qtyOut: row.qtyOut,
      unitAmount: row.unitAmount,
      runningBalance: balance,
      note: row.note,
    });
  }

  const openingRow = chronological[0]?.type === "OPENING" ? chronological[0] : null;
  const movements = chronological.filter((row) => row.type !== "OPENING").reverse();
  if (openingRow) movements.unshift(openingRow);

  return {
    product: {
      id: product.id,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      stockQuantity: product.stockQuantity,
    },
    movements,
  };
}
