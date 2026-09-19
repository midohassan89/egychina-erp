import type { Prisma, PrismaClient } from "@prisma/client";
import { roundMoney } from "@/lib/pos/money";

type TxClient = Prisma.TransactionClient | PrismaClient;

/**
 * Resolve unit cost for financial impact:
 * latest purchase invoice line cost, else selling price as fallback.
 */
export async function resolveProductUnitCost(
  db: TxClient,
  productId: string,
): Promise<number> {
  const lastPurchase = await db.purchaseInvoiceItem.findFirst({
    where: { productId },
    orderBy: { id: "desc" },
    select: { unitCost: true },
  });
  if (lastPurchase && Number.isFinite(lastPurchase.unitCost)) {
    return roundMoney(lastPurchase.unitCost);
  }

  const product = await db.product.findUnique({
    where: { id: productId },
    select: { price: true },
  });
  return roundMoney(product?.price ?? 0);
}
