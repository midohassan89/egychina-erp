import { roundMoney } from "@/lib/pos/money";
import { wooCommerceFetch, WooCommerceError } from "@/lib/woocommerce/client";

export interface OpeningBalanceLineInput {
  productId: string;
  packQty: number;
  packSize: number;
  looseQty: number;
  pieceCost: number;
  totalStock: number;
  totalValue: number;
}

interface RawLine {
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

export function parseOpeningBalanceItems(
  raw: unknown,
  options?: { allowEmpty?: boolean },
): { lines: OpeningBalanceLineInput[] } | { error: string } {
  const rawItems = Array.isArray(raw) ? (raw as RawLine[]) : [];
  if (rawItems.length === 0 && !options?.allowEmpty) {
    return { error: "Add at least one product" };
  }

  const lines: OpeningBalanceLineInput[] = [];
  const seen = new Set<string>();
  for (const row of rawItems) {
    const productId = row.productId?.trim() ?? "";
    if (!productId) return { error: "Each line needs a product" };
    if (seen.has(productId)) {
      return { error: "Each product can appear once on an opening balance" };
    }
    seen.add(productId);

    const packQty = whole(row.packQty);
    const packSize = whole(row.packSize);
    const looseQty = whole(row.looseQty);
    const pieceCost = Number(row.pieceCost);
    if (packQty < 0 || looseQty < 0 || packSize < 1) {
      return {
        error:
          "Pack quantity and loose quantity must be zero or more, and pack size at least 1",
      };
    }
    if (!Number.isFinite(pieceCost) || pieceCost < 0) {
      return { error: "Piece cost must be zero or more" };
    }
    const totalStock = packQty * packSize + looseQty;
    if (totalStock <= 0) {
      return { error: "Each line needs cartons or loose pieces" };
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

  return { lines };
}

export function localOpeningBalanceDay(value: unknown): Date {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function formatOpeningBalanceDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export async function syncOpeningBalanceStock(
  rows: { wcId: number; stockQuantity: number }[],
): Promise<string | null> {
  const wooUpdates = rows.map((row) => ({
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
      return error instanceof WooCommerceError
        ? error.message
        : "WooCommerce stock sync failed";
    }
  }
  return null;
}
