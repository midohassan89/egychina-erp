import type { CartLine } from "@/types/pos";
import { computeLineTotal } from "@/types/pos";
import type { CachedProduct } from "@/types/woocommerce";
import { roundMoney, roundQty } from "@/lib/pos/money";
import type { QueueTicketItem } from "@/lib/pos/queueTicket";

function newLineId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function findCatalogProduct(
  catalog: CachedProduct[],
  item: QueueTicketItem,
): CachedProduct | undefined {
  const packageId = item.packageId?.trim() || "";
  if (packageId) {
    const pkg = catalog.find(
      (product) =>
        product.isPackage &&
        (product.posKey === `${item.productId}-pkg-${packageId}` ||
          product.posKey?.endsWith(`-pkg-${packageId}`)),
    );
    if (pkg) return pkg;
  }

  return (
    catalog.find(
      (product) =>
        !product.isPackage &&
        (product.prismaId === item.productId ||
          String(product.id) === item.productId),
    ) ??
    catalog.find((product) => {
      if (!item.barcode?.trim()) return false;
      const barcodes = [
        product.sku,
        ...(product.meta_data ?? [])
          .filter((row) => row.key === "_op_barcode" || row.key === "op_barcode")
          .map((row) => String(row.value ?? "")),
      ];
      return barcodes.some((code) => code.trim() === item.barcode!.trim());
    })
  );
}

/**
 * Map a claimed mobile queue ticket into POS cart lines using the live catalog.
 */
export function queueItemsToCartLines(
  items: QueueTicketItem[],
  catalog: CachedProduct[],
): { lines: CartLine[]; missing: string[] } {
  const lines: CartLine[] = [];
  const missing: string[] = [];

  for (const item of items) {
    const product = findCatalogProduct(catalog, item);
    if (!product) {
      missing.push(item.name || item.productId);
      continue;
    }

    const qty = roundQty(Math.abs(item.quantity));
    if (qty <= 0) continue;
    const unitPrice = roundMoney(Math.abs(item.unitPrice));
    const isScale = Boolean(item.isWeighted || product.isWeighed);

    const productWithZh: CachedProduct = {
      ...product,
      nameZh: item.nameZh?.trim() || product.nameZh || null,
      name: item.name?.trim() || product.name,
    };

    if (isScale) {
      const lineTotal = roundMoney(qty * unitPrice);
      lines.push({
        lineId: newLineId(),
        product: productWithZh,
        qty,
        unitPrice,
        lineTotal,
        isScalePriced: true,
        isWeighted: true,
        weightKg: qty,
        barcode: item.barcode ?? undefined,
        discountType: null,
        discountValue: 0,
      });
      continue;
    }

    lines.push({
      lineId: newLineId(),
      product: productWithZh,
      qty,
      unitPrice,
      lineTotal: computeLineTotal(qty, unitPrice),
      isScalePriced: false,
      isWeighted: false,
      barcode: item.barcode ?? undefined,
      discountType: null,
      discountValue: 0,
    });
  }

  return { lines, missing };
}
