import type { CartLine } from "@/types/pos";
import type {
  CreateOrderLineItem,
  CreateOrderPayload,
  PaymentMethod,
  SaleLine,
} from "@/types/woocommerce";

function money(amount: number): string {
  return amount.toFixed(2);
}

/**
 * Persist cart rows for the local ledger / offline queue.
 * Weighed scale lines keep the calculated kilograms and the barcode line total.
 */
export function cartToSaleLines(lines: CartLine[]): SaleLine[] {
  return lines.map((line) => {
    const isScale = line.isScalePriced || line.isWeighted;
    return {
      productId: line.product.id,
      name: line.product.name,
      nameZh: line.product.nameZh?.trim() || null,
      sku: line.product.sku ?? "",
      qty: line.qty,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
      isWeighted: isScale,
      isLocal: Boolean(line.product.isLocal),
    };
  });
}

/**
 * WooCommerce REST order payload.
 * Status `completed` so stock is deducted immediately.
 * Weighed lines send the calculated quantity and the barcode line total.
 */
export function saleLinesToOrderPayload(
  lines: SaleLine[],
  paymentMethod: PaymentMethod,
  customerId: number | null,
): CreateOrderPayload {
  const line_items: CreateOrderLineItem[] = lines.map((line) => {
    const quantity = Math.abs(line.qty);
    const totals = {
      quantity,
      subtotal: money(line.lineTotal),
      total: money(line.lineTotal),
    };

    if (line.isLocal) {
      return { name: line.name, ...totals };
    }

    return { product_id: line.productId, ...totals };
  });

  const titles: Record<string, string> = {
    cash: "POS Cash",
    visa: "POS Visa",
    wallet: "POS Wallet",
    instapay: "POS InstaPay",
    wechat: "POS WeChat",
    card: "POS Card",
  };

  return {
    status: "completed",
    set_paid: true,
    payment_method: `pos_${paymentMethod === "card" ? "visa" : paymentMethod}`,
    payment_method_title: titles[paymentMethod] ?? `POS ${paymentMethod}`,
    ...(customerId ? { customer_id: customerId } : {}),
    line_items,
  };
}
