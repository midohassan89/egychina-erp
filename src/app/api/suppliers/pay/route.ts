import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { roundMoney } from "@/lib/treasury/ensureTreasury";
import {
  debitPaymentSource,
  parsePaymentSource,
} from "@/lib/treasury/debitPaymentSource";
import { resolvePurchaseStatus } from "@/lib/purchases/createPurchase";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

/**
 * POST /api/suppliers/pay
 * Record supplier payment, decrease A/P, debit Treasury or selected bank,
 * and allocate the payment FIFO across outstanding purchase invoices
 * (oldest UNPAID/PARTIAL first).
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    supplierId?: number;
    amount?: number;
    notes?: string | null;
    date?: string | null;
    sourceType?: string;
    bankAccountId?: number | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const supplierId = Number(body.supplierId);
  const amount = roundMoney(Number(body.amount));
  const notes =
    body.notes != null && String(body.notes).trim()
      ? String(body.notes).trim()
      : null;
  const payDate = body.date ? new Date(body.date) : new Date();

  if (!Number.isFinite(supplierId) || supplierId <= 0) {
    return NextResponse.json({ error: "Invalid supplier" }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "Payment amount must be greater than 0" },
      { status: 400 },
    );
  }
  if (Number.isNaN(payDate.getTime())) {
    return NextResponse.json({ error: "Invalid payment date" }, { status: 400 });
  }

  let source: ReturnType<typeof parsePaymentSource>;
  try {
    source = parsePaymentSource(body);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid payment source" },
      { status: 400 },
    );
  }

  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
  });
  if (!supplier) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }

  // Outstanding invoices — oldest first (FIFO)
  const outstanding = await prisma.purchaseInvoice.findMany({
    where: {
      supplierId,
      status: { in: ["UNPAID", "PARTIAL"] },
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });

  let availableMoney = amount;
  const invoicesToUpdate: {
    id: number;
    paidAmount: number;
    status: "PAID" | "PARTIAL" | "UNPAID";
    applied: number;
  }[] = [];

  for (const invoice of outstanding) {
    if (availableMoney <= 0.001) break;

    const owedOnInvoice = roundMoney(
      invoice.totalAmount - invoice.paidAmount,
    );
    if (owedOnInvoice <= 0.001) continue;

    if (availableMoney + 0.001 >= owedOnInvoice) {
      const newPaid = roundMoney(invoice.totalAmount);
      invoicesToUpdate.push({
        id: invoice.id,
        paidAmount: newPaid,
        status: "PAID",
        applied: owedOnInvoice,
      });
      availableMoney = roundMoney(availableMoney - owedOnInvoice);
    } else {
      const applied = availableMoney;
      const newPaid = roundMoney(invoice.paidAmount + applied);
      invoicesToUpdate.push({
        id: invoice.id,
        paidAmount: newPaid,
        status: resolvePurchaseStatus(invoice.totalAmount, newPaid),
        applied,
      });
      availableMoney = 0;
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.supplierPayment.create({
        data: {
          supplierId,
          amount,
          date: payDate,
          notes,
          bankAccountId: source.bankAccountId,
        },
        include: { bankAccount: true },
      });

      const updatedSupplier = await tx.supplier.update({
        where: { id: supplierId },
        data: { balance: { decrement: amount } },
      });

      const debit = await debitPaymentSource(tx, {
        sourceType: source.sourceType,
        bankAccountId: source.bankAccountId,
        amount,
        reference: "SUPPLIER_PAY",
        description: `Supplier Payment to ${supplier.name}`,
        date: payDate,
      });

      await Promise.all(
        invoicesToUpdate.map((inv) =>
          tx.purchaseInvoice.update({
            where: { id: inv.id },
            data: {
              paidAmount: inv.paidAmount,
              status: inv.status,
            },
          }),
        ),
      );

      return {
        payment,
        supplier: updatedSupplier,
        debit,
      };
    });

    return NextResponse.json({
      ok: true,
      payment: {
        id: result.payment.id,
        supplierId: result.payment.supplierId,
        amount: result.payment.amount,
        date: result.payment.date.toISOString(),
        notes: result.payment.notes,
        bankAccountId: result.payment.bankAccountId,
        bankAccountName: result.payment.bankAccount?.name ?? null,
      },
      supplier: {
        id: result.supplier.id,
        name: result.supplier.name,
        balance: result.supplier.balance,
        openingBalance: result.supplier.openingBalance,
      },
      source: result.debit,
      allocations: invoicesToUpdate.map((inv) => ({
        invoiceId: inv.id,
        applied: inv.applied,
        paidAmount: inv.paidAmount,
        status: inv.status,
      })),
      unallocated: roundMoney(availableMoney),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Payment failed";
    const status = message.startsWith("Insufficient") ? 400 : 500;
    if (status === 500) console.error("[api/suppliers/pay]", error);
    return NextResponse.json({ error: message }, { status });
  }
}
