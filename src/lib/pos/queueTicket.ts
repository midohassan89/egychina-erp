import type { Prisma, PrismaClient } from "@prisma/client";
import { roundMoney, roundQty } from "@/lib/pos/money";

type Db = Prisma.TransactionClient | PrismaClient;

export const QUEUE_STATUSES = [
  "PENDING",
  "CLAIMED",
  "COMPLETED",
  "CANCELLED",
] as const;

export type QueueTicketStatus = (typeof QUEUE_STATUSES)[number];

export type QueueTicketItem = {
  productId: string;
  packageId?: string | null;
  name: string;
  barcode?: string | null;
  quantity: number;
  unitPrice: number;
  originalPrice?: number | null;
  isWeighted?: boolean;
  /** Base units per sold qty (package pack size). */
  stockMultiplier?: number;
  nameZh?: string | null;
  imageUrl?: string | null;
};

export function normalizeQueueCode(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export function isQueueTicketCode(raw: string): boolean {
  return /^Q-\d+$/i.test(String(raw ?? "").trim());
}

export async function allocateQueueTicketCode(db: Db): Promise<string> {
  const counter = await db.orderNumberCounter.upsert({
    where: { channel: "QUEUE" },
    create: { channel: "QUEUE", nextValue: 1002 },
    update: { nextValue: { increment: 1 } },
  });
  const issued = counter.nextValue - 1;
  return `Q-${issued}`;
}

export function parseQueueItemsJson(raw: string): QueueTicketItem[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => normalizeQueueItem(row))
      .filter((row): row is QueueTicketItem => row != null);
  } catch {
    return [];
  }
}

export function normalizeQueueItem(raw: unknown): QueueTicketItem | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const productId = String(row.productId ?? "").trim();
  const name = String(row.name ?? "").trim();
  const quantity = roundQty(Math.abs(Number(row.quantity) || 0));
  const unitPrice = roundMoney(Math.abs(Number(row.unitPrice) || 0));
  if (!productId || !name || quantity <= 0) return null;
  const stockMultiplier = Math.max(
    1,
    Math.floor(Number(row.stockMultiplier) || 1),
  );
  return {
    productId,
    packageId: row.packageId != null ? String(row.packageId).trim() || null : null,
    name,
    barcode: row.barcode != null ? String(row.barcode).trim() || null : null,
    quantity,
    unitPrice,
    originalPrice:
      row.originalPrice != null && Number.isFinite(Number(row.originalPrice))
        ? roundMoney(Math.abs(Number(row.originalPrice)))
        : null,
    isWeighted: Boolean(row.isWeighted),
    stockMultiplier,
    nameZh: row.nameZh != null ? String(row.nameZh).trim() || null : null,
    imageUrl: row.imageUrl != null ? String(row.imageUrl).trim() || null : null,
  };
}

export function summarizeQueueItems(items: QueueTicketItem[]): {
  subtotal: number;
  total: number;
} {
  const subtotal = roundMoney(
    items.reduce(
      (sum, item) => sum + roundMoney(item.quantity * item.unitPrice),
      0,
    ),
  );
  return { subtotal, total: subtotal };
}

export function serializeQueueTicket(ticket: {
  id: string;
  code: string;
  status: string;
  itemsJson: string;
  subtotal: number;
  discount: number;
  total: number;
  customerId: string | null;
  customerPhone: string | null;
  customerName: string | null;
  notes: string | null;
  createdById: string;
  createdByName: string | null;
  claimedById: string | null;
  saleId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: ticket.id,
    code: ticket.code,
    status: ticket.status,
    items: parseQueueItemsJson(ticket.itemsJson),
    subtotal: ticket.subtotal,
    discount: ticket.discount,
    total: ticket.total,
    customerId: ticket.customerId,
    customerPhone: ticket.customerPhone,
    customerName: ticket.customerName,
    notes: ticket.notes,
    createdById: ticket.createdById,
    createdByName: ticket.createdByName,
    claimedById: ticket.claimedById,
    saleId: ticket.saleId,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}
