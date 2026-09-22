import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth/roles";
import { logAuditAction } from "@/lib/audit/logAuditAction";
import { resolvePurchaseStatus } from "@/lib/purchases/createPurchase";
import { roundMoney } from "@/lib/treasury/ensureTreasury";
import { debitPaymentSource } from "@/lib/treasury/debitPaymentSource";

/**
 * POST /api/purchases/[id]/settle
 * Admin-only manual invoice settlement (تسوية يدوية).
 *
 * Body: { amount: number, statusOnly?: boolean }
 * - statusOnly=true (default): update invoice paidAmount/status only —
 *   no Treasury debit and no Supplier balance change.
 * - statusOnly=false: also debit Treasury cash and reduce supplier A/P.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session.user.role)) {
    return NextResponse.json(
      { error: "Only Administrators can manually settle purchase invoices" },
      { status: 403 },
    );
  }

  const { id: idParam } = await context.params;
  const invoiceId = Number(idParam);
  if (!Number.isFinite(invoiceId) || invoiceId <= 0) {
    return NextResponse.json({ error: "Invalid invoice id" }, { status: 400 });
  }

  let body: {
    amount?: number;
    statusOnly?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const amount = roundMoney(Number(body.amount));
  const statusOnly = body.statusOnly !== false; // default true

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "Amount to allocate must be greater than 0" },
      { status: 400 },
    );
  }

  const invoice = await prisma.purchaseInvoice.findUnique({
    where: { id: invoiceId },
    include: { supplier: { select: { id: true, name: true, balance: true } } },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  if (invoice.status !== "UNPAID" && invoice.status !== "PARTIAL") {
    return NextResponse.json(
      { error: "Only UNPAID or PARTIAL invoices can be settled" },
      { status: 400 },
    );
  }

  const remaining = roundMoney(invoice.totalAmount - invoice.paidAmount);
  if (remaining <= 0.001) {
    return NextResponse.json(
      { error: "Invoice has no remaining balance" },
      { status: 400 },
    );
  }

  const applied = roundMoney(Math.min(amount, remaining));
  const newPaidAmount = roundMoney(invoice.paidAmount + applied);
  const newStatus = resolvePurchaseStatus(invoice.totalAmount, newPaidAmount);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseInvoice.update({
        where: { id: invoiceId },
        data: {
          paidAmount: newPaidAmount,
          status: newStatus,
        },
        include: {
          supplier: { select: { id: true, name: true, balance: true } },
        },
      });

      let supplierBalance = updated.supplier.balance;
      let debit: Awaited<ReturnType<typeof debitPaymentSource>> | null = null;
      let paymentId: number | null = null;

      if (!statusOnly) {
        const supplier = await tx.supplier.update({
          where: { id: invoice.supplierId },
          data: { balance: { decrement: applied } },
        });
        supplierBalance = supplier.balance;

        const payment = await tx.supplierPayment.create({
          data: {
            supplierId: invoice.supplierId,
            amount: applied,
            date: new Date(),
            notes: `Manual settle PI-${invoice.id}${invoice.invoiceNumber ? ` (${invoice.invoiceNumber})` : ""}`,
            bankAccountId: null,
          },
        });
        paymentId = payment.id;

        debit = await debitPaymentSource(tx, {
          sourceType: "TREASURY",
          bankAccountId: null,
          amount: applied,
          reference: "SUPPLIER_PAY",
          description: `Manual settle ${invoice.supplier.name} · PI-${invoice.id}`,
          date: new Date(),
        });
      }

      return { updated, supplierBalance, debit, paymentId };
    });

    await logAuditAction(session.user.id, "UPDATE", "INVOICE", invoiceId, {
      type: "manual_settle",
      adminName: session.user.name,
      statusOnly,
      applied,
      paidAmount: newPaidAmount,
      status: newStatus,
      message: `Admin ${session.user.name ?? "unknown"} settled Purchase Invoice #${invoiceId} (${statusOnly ? "status only" : "with treasury"})`,
    });

    return NextResponse.json({
      ok: true,
      statusOnly,
      applied,
      invoice: {
        id: result.updated.id,
        invoiceNumber: result.updated.invoiceNumber,
        totalAmount: result.updated.totalAmount,
        paidAmount: result.updated.paidAmount,
        status: result.updated.status,
        dueAmount: roundMoney(
          result.updated.totalAmount - result.updated.paidAmount,
        ),
        supplierId: result.updated.supplierId,
        supplierName: result.updated.supplier.name,
        supplierBalance: result.supplierBalance,
      },
      paymentId: result.paymentId,
      source: result.debit,
      message: statusOnly
        ? `Invoice status updated · allocated ${applied.toFixed(2)} EGP (no treasury/ledger)`
        : `Invoice settled · allocated ${applied.toFixed(2)} EGP from Treasury`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Settlement failed";
    const status = message.startsWith("Insufficient") ? 400 : 500;
    if (status === 500) {
      console.error("[api/purchases/[id]/settle]", error);
    }
    return NextResponse.json({ error: message }, { status });
  }
}
