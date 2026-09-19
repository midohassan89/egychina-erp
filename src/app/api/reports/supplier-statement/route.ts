import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { roundMoney } from "@/lib/pos/money";
import { resolveReportPeriod } from "@/lib/reports/period";

function requireEditor(role: string | undefined) {
  return role === "MANAGER" || role === "ACCOUNTANT" || role === "ADMIN";
}

type LedgerKind = "INVOICE" | "PAYMENT" | "RETURN";

type RawEvent = {
  kind: LedgerKind;
  date: Date;
  sortKey: number;
  reference: string;
  notes: string | null;
  debit: number;
  credit: number;
};

/**
 * GET /api/reports/supplier-statement?supplierId=&startDate=&endDate=
 * Chronological A/P ledger with opening + running balance.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requireEditor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const supplierId = Number(searchParams.get("supplierId"));
  if (!Number.isFinite(supplierId) || supplierId <= 0) {
    return NextResponse.json({ error: "supplierId is required" }, { status: 400 });
  }

  const { start, end } = resolveReportPeriod(
    searchParams.get("startDate"),
    searchParams.get("endDate"),
  );

  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
  });
  if (!supplier) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }

  const [invoices, payments, returns] = await Promise.all([
    prisma.purchaseInvoice.findMany({
      where: { supplierId },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    }),
    prisma.supplierPayment.findMany({
      where: { supplierId },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    }),
    prisma.purchaseReturn.findMany({
      where: { supplierId },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    }),
  ]);

  const allEvents: RawEvent[] = [];

  for (const inv of invoices) {
    allEvents.push({
      kind: "INVOICE",
      date: inv.date,
      sortKey: inv.id,
      reference: inv.invoiceNumber
        ? `Invoice ${inv.invoiceNumber}`
        : `Invoice #${inv.id}`,
      notes: `Status: ${inv.status}`,
      debit: roundMoney(inv.totalAmount),
      // Amount paid at invoice creation (no separate payment row)
      credit: roundMoney(inv.paidAmount),
    });
  }

  for (const pay of payments) {
    allEvents.push({
      kind: "PAYMENT",
      date: pay.date,
      sortKey: pay.id,
      reference: `Payment #${pay.id}`,
      notes: pay.notes,
      debit: 0,
      credit: roundMoney(pay.amount),
    });
  }

  for (const ret of returns) {
    allEvents.push({
      kind: "RETURN",
      date: ret.date,
      sortKey: ret.id,
      reference: `Return #${ret.id}`,
      notes: ret.notes,
      debit: 0,
      credit: roundMoney(ret.totalAmount),
    });
  }

  allEvents.sort((a, b) => {
    const t = a.date.getTime() - b.date.getTime();
    if (t !== 0) return t;
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return a.sortKey - b.sortKey;
  });

  const startMs = start.getTime();
  const endMs = end.getTime();

  let openingBalance = 0;
  for (const ev of allEvents) {
    if (ev.date.getTime() < startMs) {
      openingBalance = roundMoney(openingBalance + ev.debit - ev.credit);
    }
  }

  const periodEvents = allEvents.filter((ev) => {
    const t = ev.date.getTime();
    return t >= startMs && t <= endMs;
  });

  let running = openingBalance;
  const rows = periodEvents.map((ev, index) => {
    running = roundMoney(running + ev.debit - ev.credit);
    return {
      id: `${ev.kind}-${ev.sortKey}`,
      index: index + 1,
      date: ev.date.toISOString(),
      type: ev.kind,
      typeLabel:
        ev.kind === "INVOICE"
          ? "Invoice / فاتورة"
          : ev.kind === "PAYMENT"
            ? "Payment / سداد"
            : "Return / مرتجع",
      reference: ev.reference,
      notes: ev.notes,
      debit: ev.debit,
      credit: ev.credit,
      runningBalance: running,
    };
  });

  const periodDebit = roundMoney(rows.reduce((s, r) => s + r.debit, 0));
  const periodCredit = roundMoney(rows.reduce((s, r) => s + r.credit, 0));
  const closingBalance = roundMoney(
    openingBalance + periodDebit - periodCredit,
  );

  return NextResponse.json({
    supplier: {
      id: supplier.id,
      name: supplier.name,
      phone: supplier.phone,
      currentBalance: supplier.balance,
    },
    period: {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    },
    openingBalance,
    closingBalance,
    periodDebit,
    periodCredit,
    rows,
  });
}
