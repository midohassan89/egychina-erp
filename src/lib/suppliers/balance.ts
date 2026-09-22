import type { Prisma, PrismaClient } from "@prisma/client";
import { roundMoney } from "@/lib/pos/money";

type TxClient = Prisma.TransactionClient | PrismaClient;

export function serializeSupplier(s: {
  id: number;
  name: string;
  phone: string | null;
  balance: number;
  openingBalance: number;
  paidOpeningBalance: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  const openingBalance = roundMoney(s.openingBalance ?? 0);
  const paidOpeningBalance = roundMoney(
    Math.min(openingBalance, s.paidOpeningBalance ?? 0),
  );
  return {
    id: s.id,
    name: s.name,
    phone: s.phone,
    /** Total owed (A/P) — includes opening balance. */
    balance: s.balance,
    openingBalance,
    paidOpeningBalance,
    unpaidOpeningBalance: roundMoney(
      Math.max(0, openingBalance - paidOpeningBalance),
    ),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

/**
 * Compute total owed from ledger components:
 * openingBalance + Σ purchase totals − Σ payments − Σ returns.
 */
export async function computeSupplierOwed(
  db: TxClient,
  supplierId: number,
): Promise<number> {
  const supplier = await db.supplier.findUnique({
    where: { id: supplierId },
    select: { openingBalance: true },
  });
  if (!supplier) return 0;

  const [purchases, payments, returns] = await Promise.all([
    db.purchaseInvoice.aggregate({
      where: { supplierId },
      _sum: { totalAmount: true },
    }),
    db.supplierPayment.aggregate({
      where: { supplierId },
      _sum: { amount: true },
    }),
    db.purchaseReturn.aggregate({
      where: { supplierId },
      _sum: { totalAmount: true },
    }),
  ]);

  return roundMoney(
    (supplier.openingBalance ?? 0) +
      (purchases._sum.totalAmount ?? 0) -
      (payments._sum.amount ?? 0) -
      (returns._sum.totalAmount ?? 0),
  );
}

/**
 * Apply an opening-balance change and keep live A/P (`balance`) in sync.
 * Delta is added to balance so existing purchase/payment activity is preserved.
 * paidOpeningBalance is clamped so it never exceeds the new openingBalance.
 */
export async function applyOpeningBalanceChange(
  db: TxClient,
  supplierId: number,
  newOpeningBalance: number,
): Promise<{
  openingBalance: number;
  paidOpeningBalance: number;
  balance: number;
}> {
  const openingBalance = roundMoney(Math.max(0, newOpeningBalance));
  const existing = await db.supplier.findUnique({
    where: { id: supplierId },
    select: {
      openingBalance: true,
      paidOpeningBalance: true,
      balance: true,
    },
  });
  if (!existing) {
    throw new Error("Supplier not found");
  }

  const oldOpening = roundMoney(existing.openingBalance ?? 0);
  const delta = roundMoney(openingBalance - oldOpening);
  const paidOpeningBalance = roundMoney(
    Math.min(openingBalance, existing.paidOpeningBalance ?? 0),
  );

  const updated = await db.supplier.update({
    where: { id: supplierId },
    data: {
      openingBalance,
      paidOpeningBalance,
      ...(Math.abs(delta) > 0.001
        ? { balance: { increment: delta } }
        : {}),
    },
  });

  return {
    openingBalance: updated.openingBalance,
    paidOpeningBalance: updated.paidOpeningBalance,
    balance: updated.balance,
  };
}
