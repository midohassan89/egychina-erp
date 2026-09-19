import type { PaymentMethod, LocalSale } from "@/types/woocommerce";
import { roundMoney } from "@/lib/pos/money";

export type SaleWithRelations = {
  id: string;
  localId: string | null;
  shiftId: number | null;
  userId: string | null;
  total: number;
  paymentMethod: string;
  isReturn: boolean;
  status: string;
  wooOrderId: number | null;
  customerName: string | null;
  createdAt: Date;
  user: { id: string; username: string } | null;
  lines: {
    id: number;
    productId: string | null;
    wcProductId: number | null;
    name: string;
    quantity: number;
    unitPrice: number;
    unitCost: number;
    lineTotal: number;
  }[];
};

export function mapSaleToHistoryRow(sale: SaleWithRelations) {
  const receiptNumber =
    sale.wooOrderId != null
      ? `WC-${sale.wooOrderId}`
      : sale.id.slice(0, 8).toUpperCase();

  const linesSubtotal = roundMoney(
    sale.lines.reduce((sum, l) => sum + l.lineTotal, 0),
  );

  return {
    id: sale.id,
    receiptNumber,
    localId: sale.localId,
    createdAt: sale.createdAt.toISOString(),
    cashierName: sale.user?.username ?? "—",
    cashierId: sale.userId,
    paymentMethod: sale.paymentMethod,
    total: sale.total,
    status: sale.status,
    isReturn: sale.isReturn,
    wooOrderId: sale.wooOrderId,
    customerName: sale.customerName ?? "Walk-in",
    itemCount: sale.lines.length,
    linesSubtotal,
    discount: roundMoney(Math.max(0, Math.abs(linesSubtotal) - Math.abs(sale.total))),
  };
}

export function mapSaleToDetail(sale: SaleWithRelations) {
  const row = mapSaleToHistoryRow(sale);
  return {
    ...row,
    lines: sale.lines.map((line) => ({
      id: line.id,
      productId: line.productId,
      wcProductId: line.wcProductId,
      name: line.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      unitCost: line.unitCost,
      lineTotal: line.lineTotal,
    })),
  };
}

/** Convert Prisma Sale → LocalSale for thermal ReceiptTicket reprint. */
export function mapSaleToLocalSale(sale: SaleWithRelations): LocalSale {
  const absTotal = Math.abs(sale.total);
  return {
    id: sale.id,
    createdAt: sale.createdAt.toISOString(),
    paymentMethod: sale.paymentMethod as PaymentMethod,
    customerId: null,
    customerName: sale.customerName ?? "Walk-in",
    lines: sale.lines.map((line) => ({
      productId: line.wcProductId ?? 0,
      name: line.name,
      sku: "",
      qty: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
      isWeighted: false,
      isLocal: line.wcProductId == null || line.wcProductId <= 0,
    })),
    total: sale.total,
    tendered: absTotal,
    change: 0,
    wooOrderId: sale.wooOrderId,
    syncStatus: "synced",
    shiftId: sale.shiftId != null ? String(sale.shiftId) : null,
    isReturn: sale.isReturn,
    cashierId: sale.userId,
    cashierName: sale.user?.username ?? null,
  };
}
