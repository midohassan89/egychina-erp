import { getSales } from "@/lib/cache/indexeddb";
import { receiptBarcodeValue } from "@/lib/pos/code128";
import type { LocalSale } from "@/types/woocommerce";

export interface ReceiptLine {
  name: string;
  nameZh: string | null;
  sku: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  wcProductId: number | null;
}

/** True when a scan should be tried as a previous cashier ticket. */
export function looksLikeReceiptCode(raw: string): boolean {
  const code = raw.trim().toUpperCase();
  if (/^POS-\d+$/.test(code)) return true;
  if (/^POS-[0-9A-F]{8}$/.test(code)) return true;
  if (/^WC-\d+$/.test(code)) return true;
  if (/^[0-9A-F]{8}$/.test(code)) return true;
  if (/^[0-9A-F]{12}$/.test(code)) return true;
  return false;
}

function localSaleMatches(sale: LocalSale, raw: string): boolean {
  if (sale.isReturn) return false;
  const code = raw.trim().toUpperCase();
  if (sale.orderNumber && sale.orderNumber.toUpperCase() === code) return true;
  if (receiptBarcodeValue(sale) === code) return true;
  const body = code.replace(/^POS-/, "").replace(/^WC-/, "");
  if (!/^[0-9A-F]{8,12}$/.test(body) || !/[A-F]/.test(body)) return false;
  const compact = sale.id.replace(/-/g, "").toUpperCase();
  return compact.startsWith(body);
}

export async function findReceiptLines(code: string): Promise<ReceiptLine[] | null> {
  if (typeof navigator !== "undefined" && navigator.onLine) {
    try {
      const res = await fetch(
        `/api/pos/receipts?code=${encodeURIComponent(code.trim())}`,
        { cache: "no-store" },
      );
      if (res.ok) {
        const body = (await res.json()) as {
          found?: boolean;
          lines?: ReceiptLine[];
        };
        if (body.found && body.lines && body.lines.length > 0) return body.lines;
      }
    } catch {
      // Fall through to this register's saved tickets.
    }
  }

  const sales = await getSales();
  const match = sales.find((sale) => localSaleMatches(sale, code));
  if (!match || match.lines.length === 0) return null;
  return match.lines.map((line) => ({
    name: line.name,
    nameZh: line.nameZh ?? null,
    sku: line.sku,
    qty: Math.abs(line.qty),
    unitPrice: Math.abs(line.unitPrice),
    lineTotal: Math.abs(line.lineTotal),
    wcProductId: line.productId > 0 ? line.productId : null,
  }));
}
