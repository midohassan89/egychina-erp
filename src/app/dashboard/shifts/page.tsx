"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, ScrollText, X } from "lucide-react";
import { clsx } from "clsx";
import { formatEGP, roundMoney } from "@/lib/pos/money";
import type { ZReportSummary } from "@/types/woocommerce";
import { useReceiptPrint } from "@/hooks/useReceiptPrint";

interface ShiftRow {
  id: number;
  shiftId: string;
  cashierName: string;
  startedAt: string;
  endedAt: string | null;
  status: string;
  totalSales: number;
  cashSales: number;
  visaSales: number;
  walletSales: number;
  instapaySales: number;
  wechatSales: number;
  startingCash: number;
  expectedCash: number;
  actualCash: number | null;
  variance: number | null;
  ticketCount: number;
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function rowToReport(row: ShiftRow): ZReportSummary {
  const cardSales = roundMoney(
    row.visaSales + row.walletSales + row.instapaySales + row.wechatSales,
  );
  return {
    shiftId: row.shiftId,
    startedAt: row.startedAt,
    endedAt: row.endedAt ?? new Date().toISOString(),
    startingCash: row.startingCash,
    cashSales: row.cashSales,
    visaSales: row.visaSales,
    walletSales: row.walletSales,
    instapaySales: row.instapaySales,
    wechatSales: row.wechatSales,
    cardSales,
    totalSales: row.totalSales,
    expectedCash: row.expectedCash,
    ticketCount: row.ticketCount,
    cashTickets: 0,
    cardTickets: 0,
    cashRefunds: 0,
    returnTickets: 0,
    actualCash: row.actualCash ?? undefined,
    variance: row.variance ?? undefined,
  };
}

export default function ShiftsHistoryPage() {
  const { printZReport, receiptNode } = useReceiptPrint();
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ShiftRow | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/shifts");
      const body = (await res.json()) as {
        error?: string;
        shifts?: ShiftRow[];
      };
      if (!res.ok) throw new Error(body.error ?? "Failed to load shifts");
      setShifts(body.shifts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const report = selected ? rowToReport(selected) : null;

  return (
    <div className="space-y-6">
      {receiptNode}

      <div className="flex flex-wrap items-end justify-between gap-3 dashboard-no-print">
        <div>
          <Link
            href="/dashboard/reports"
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Reports
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">
            Shifts / Z-Reports
          </h1>
          <p className="mt-1 text-slate-500">
            سجل الورديات — historical register closes and Z-Reports
          </p>
        </div>
      </div>

      {error && (
        <p className="dashboard-no-print rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="dashboard-no-print overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Shift ID</th>
                <th className="px-4 py-3">Cashier</th>
                <th className="px-4 py-3">Start</th>
                <th className="px-4 py-3">End</th>
                <th className="px-4 py-3 text-right">Total Revenue</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-slate-400"
                  >
                    Loading…
                  </td>
                </tr>
              ) : shifts.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-slate-400"
                  >
                    No shifts recorded yet.
                  </td>
                </tr>
              ) : (
                shifts.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-mono text-xs font-semibold tabular-nums text-slate-900">
                      #{s.id}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {s.cashierName}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {formatDateTime(s.startedAt)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {formatDateTime(s.endedAt)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                      {formatEGP(s.totalSales)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={clsx(
                          "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
                          s.status === "CLOSED"
                            ? "bg-slate-100 text-slate-700 ring-slate-200"
                            : "bg-emerald-50 text-emerald-800 ring-emerald-200",
                        )}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelected(s)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-800 hover:bg-brand-100"
                      >
                        <ScrollText className="h-3.5 w-3.5" />
                        View &amp; Print Z-Report
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && report && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 dashboard-no-print">
          <div className="flex max-h-[min(92dvh,760px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Z-Report · Shift #{selected.id}
                </h2>
                <p className="text-sm text-slate-500">
                  {selected.cashierName} · {formatDateTime(selected.startedAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div
              id="shift-z-report-print"
              className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
            >
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <Meta label="Start" value={formatDateTime(report.startedAt)} />
                  <Meta label="End" value={formatDateTime(report.endedAt)} />
                  <Meta label="Cashier" value={selected.cashierName} />
                  <Meta label="Tickets" value={String(report.ticketCount)} />
                </div>

                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                  <Row label="Starting cash" value={formatEGP(report.startingCash)} />
                  <Row label="Cash sales" value={formatEGP(report.cashSales)} />
                  <Row label="Visa" value={formatEGP(report.visaSales)} />
                  <Row label="Wallet" value={formatEGP(report.walletSales)} />
                  <Row label="InstaPay" value={formatEGP(report.instapaySales)} />
                  <Row label="WeChat" value={formatEGP(report.wechatSales)} />
                  <Row
                    label="Total sales"
                    value={formatEGP(report.totalSales)}
                    strong
                  />
                  <Row
                    label="Expected cash"
                    value={formatEGP(report.expectedCash)}
                    strong
                  />
                  <Row
                    label="Actual cash"
                    value={
                      report.actualCash != null
                        ? formatEGP(report.actualCash)
                        : "—"
                    }
                  />
                  <Row
                    label="Discrepancy / Variance"
                    value={
                      report.variance != null
                        ? formatEGP(report.variance)
                        : "—"
                    }
                    tone={
                      report.variance == null
                        ? "neutral"
                        : report.variance < -0.001
                          ? "bad"
                          : report.variance > 0.001
                            ? "good"
                            : "neutral"
                    }
                  />
                </div>
              </div>
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => printZReport(report)}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
              >
                <Printer className="h-4 w-4" />
                Print (80mm)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 font-medium text-slate-900">{value}</p>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  tone = "neutral",
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "neutral" | "good" | "bad";
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <span className={clsx("text-slate-600", strong && "font-semibold text-slate-800")}>
        {label}
      </span>
      <span
        className={clsx(
          "tabular-nums",
          strong && "font-bold",
          tone === "bad" && "font-semibold text-red-700",
          tone === "good" && "font-semibold text-emerald-700",
          tone === "neutral" && "text-slate-900",
        )}
      >
        {value}
      </span>
    </div>
  );
}
