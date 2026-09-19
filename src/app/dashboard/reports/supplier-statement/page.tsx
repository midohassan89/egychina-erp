"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { clsx } from "clsx";
import { formatEGP } from "@/lib/pos/money";

const STORE_NAME = "ايجي شاينا ماركت · Souq El Obour";

interface SupplierOption {
  id: number;
  name: string;
  balance: number;
}

interface LedgerRow {
  id: string;
  date: string;
  type: string;
  typeLabel: string;
  reference: string;
  notes: string | null;
  debit: number;
  credit: number;
  runningBalance: number;
}

function defaultMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export default function SupplierStatementPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
      <SupplierStatementPageInner />
    </Suspense>
  );
}

function SupplierStatementPageInner() {
  const searchParams = useSearchParams();
  const defaults = useMemo(() => defaultMonthRange(), []);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [supplierId, setSupplierId] = useState(
    () => searchParams.get("supplierId") ?? "",
  );
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [closingBalance, setClosingBalance] = useState(0);
  const [periodDebit, setPeriodDebit] = useState(0);
  const [periodCredit, setPeriodCredit] = useState(0);
  const [supplierName, setSupplierName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/suppliers");
      if (!res.ok) return;
      const body = (await res.json()) as { suppliers?: SupplierOption[] };
      setSuppliers(body.suppliers ?? []);
    })();
  }, []);

  const load = useCallback(async () => {
    if (!supplierId) {
      setRows([]);
      setError("Select a supplier");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        supplierId,
        startDate,
        endDate,
      });
      const res = await fetch(`/api/reports/supplier-statement?${q}`);
      const body = (await res.json()) as {
        error?: string;
        supplier?: { name: string };
        openingBalance?: number;
        closingBalance?: number;
        periodDebit?: number;
        periodCredit?: number;
        rows?: LedgerRow[];
      };
      if (!res.ok) throw new Error(body.error ?? "Failed to load statement");
      setSupplierName(body.supplier?.name ?? "");
      setOpeningBalance(body.openingBalance ?? 0);
      setClosingBalance(body.closingBalance ?? 0);
      setPeriodDebit(body.periodDebit ?? 0);
      setPeriodCredit(body.periodCredit ?? 0);
      setRows(body.rows ?? []);
      setGeneratedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, [supplierId, startDate, endDate]);

  useEffect(() => {
    if (supplierId) void load();
  }, [supplierId, load]);

  function handlePrint() {
    if (!supplierId) {
      setError("Select a supplier first");
      return;
    }
    document.documentElement.classList.add("printing-a4");
    document.documentElement.classList.remove("printing-labels");
    const cleanup = () => {
      document.documentElement.classList.remove("printing-a4");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.setTimeout(() => window.print(), 50);
  }

  return (
    <>
      <div className="dashboard-print-hide space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/dashboard/reports"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Reports
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-slate-900">
              كشف حساب مورد · Supplier Statement
            </h1>
            <p className="text-sm text-slate-500">
              Chronological A/P ledger for supplier reconciliation
            </p>
          </div>
          <button
            type="button"
            onClick={handlePrint}
            disabled={!supplierId || rows.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:bg-slate-300"
          >
            <Printer className="h-4 w-4" />
            طباعة كشف الحساب · Print
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="block min-w-[220px] flex-1">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Supplier
            </span>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">Select supplier…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({formatEGP(s.balance)})
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              From
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              To
            </span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
          <button
            type="button"
            onClick={() => void load()}
            disabled={!supplierId || isLoading}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
          >
            {isLoading ? "Loading…" : "Load"}
          </button>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}
      </div>

      <div className="supplier-statement-print mt-6 space-y-4">
        <header className="supplier-statement-header">
          <h1 className="text-xl font-bold text-slate-900">{STORE_NAME}</h1>
          <p className="text-sm text-slate-600">
            كشف حساب مورد · Supplier Account Statement
          </p>
          {supplierName && (
            <p className="mt-2 text-base font-semibold text-slate-900">
              {supplierName}
            </p>
          )}
          <p className="text-sm text-slate-500">
            Period: {startDate} → {endDate}
            {generatedAt
              ? ` · Generated ${new Date(generatedAt).toLocaleString()}`
              : ""}
          </p>
        </header>

        {supplierId && (
          <div className="grid gap-3 sm:grid-cols-4 dashboard-print-hide">
            <SummaryChip label="Opening balance" value={openingBalance} />
            <SummaryChip label="Period debit (مدين)" value={periodDebit} />
            <SummaryChip label="Period credit (دائن)" value={periodCredit} />
            <SummaryChip
              label="Closing balance (الرصيد)"
              value={closingBalance}
              emphasize
            />
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm supplier-statement-table-wrap">
          <table className="supplier-statement-table min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3">Date</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Reference / Notes</th>
                <th className="px-3 py-3 text-right">Debit (مدين)</th>
                <th className="px-3 py-3 text-right">Credit (دائن)</th>
                <th className="px-3 py-3 text-right">Balance (الرصيد)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!supplierId ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-10 text-center text-slate-400"
                  >
                    Select a supplier to load the statement.
                  </td>
                </tr>
              ) : isLoading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-10 text-center text-slate-400"
                  >
                    Loading…
                  </td>
                </tr>
              ) : (
                <>
                  <tr className="bg-slate-50 font-semibold">
                    <td className="px-3 py-2.5 text-slate-700" colSpan={3}>
                      Opening balance
                    </td>
                    <td className="px-3 py-2.5 text-right">—</td>
                    <td className="px-3 py-2.5 text-right">—</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatEGP(openingBalance)}
                    </td>
                  </tr>
                  {rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-8 text-center text-slate-400"
                      >
                        No transactions in this period.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/80">
                        <td className="px-3 py-2.5 whitespace-nowrap text-slate-700">
                          {new Date(row.date).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={clsx(
                              "inline-flex rounded-full px-2 py-0.5 text-xs font-bold ring-1 ring-inset",
                              row.type === "INVOICE" &&
                                "bg-sky-50 text-sky-900 ring-sky-200",
                              row.type === "PAYMENT" &&
                                "bg-emerald-50 text-emerald-900 ring-emerald-200",
                              row.type === "RETURN" &&
                                "bg-amber-50 text-amber-900 ring-amber-200",
                            )}
                          >
                            {row.typeLabel}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-800">
                          <p className="font-medium">{row.reference}</p>
                          {row.notes && (
                            <p className="text-xs text-slate-500">{row.notes}</p>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-900">
                          {row.debit > 0 ? formatEGP(row.debit) : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-900">
                          {row.credit > 0 ? formatEGP(row.credit) : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                          {formatEGP(row.runningBalance)}
                        </td>
                      </tr>
                    ))
                  )}
                  <tr className="bg-slate-900 font-bold text-white">
                    <td className="px-3 py-3" colSpan={3}>
                      Closing balance · الرصيد الختامي
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatEGP(periodDebit)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatEGP(periodCredit)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatEGP(closingBalance)}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function SummaryChip({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
}) {
  return (
    <div
      className={clsx(
        "rounded-xl border px-4 py-3",
        emphasize
          ? "border-slate-800 bg-slate-900 text-white"
          : "border-slate-200 bg-white",
      )}
    >
      <p
        className={clsx(
          "text-xs font-semibold uppercase tracking-wide",
          emphasize ? "text-slate-400" : "text-slate-500",
        )}
      >
        {label}
      </p>
      <p className="mt-1 text-lg font-bold tabular-nums">{formatEGP(value)}</p>
    </div>
  );
}
