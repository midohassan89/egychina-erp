"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { X } from "lucide-react";
import type { ZReportSummary } from "@/types/woocommerce";
import { formatEGP, roundMoney } from "@/lib/pos/money";
import { PosKeyboardInput } from "@/components/pos/PosKeyboardInput";
import {
  PosKeyboardScrollArea,
  usePosKeyboardOptional,
} from "@/components/pos/PosKeyboardContext";

interface ZReportModalProps {
  open: boolean;
  report: ZReportSummary | null;
  isClosing: boolean;
  onClose: () => void;
  onConfirmClose: (actualCash: number) => void;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function ZReportModal({
  open,
  report,
  isClosing,
  onClose,
  onConfirmClose,
}: ZReportModalProps) {
  const kb = usePosKeyboardOptional();
  const [actualCashInput, setActualCashInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && report) {
      setActualCashInput(String(report.expectedCash));
      setError(null);
    }
  }, [open, report]);

  useEffect(() => {
    if (!open) kb?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || !report) return null;

  const actualCash = roundMoney(parseFloat(actualCashInput || "0"));
  const variance = roundMoney(actualCash - report.expectedCash);

  function handleConfirm() {
    if (!Number.isFinite(actualCash) || actualCash < 0) {
      setError("Enter a valid actual cash count");
      return;
    }
    setError(null);
    kb?.close();
    onConfirmClose(actualCash);
  }

  return (
    <div className="pos-no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="flex max-h-[min(92dvh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Close Register (Z-Report)
            </h2>
            <p className="text-sm text-slate-500">
              Count the drawer, then deposit cash into Treasury
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              kb?.close();
              onClose();
            }}
            disabled={isClosing}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <PosKeyboardScrollArea className="flex-1 space-y-3 px-5 py-4">
          <Row label="Shift start" value={formatDateTime(report.startedAt)} />
          <Row
            label="Starting cash"
            value={formatEGP(report.startingCash)}
            emphasize
          />

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Sales this shift
            </p>
            <Row
              label="Cash sales (net)"
              value={formatEGP(report.cashSales)}
            />
            <Row label="Visa" value={formatEGP(report.visaSales)} />
            <Row label="Wallet" value={formatEGP(report.walletSales)} />
            <Row label="InstaPay" value={formatEGP(report.instapaySales)} />
            <Row label="WeChat" value={formatEGP(report.wechatSales)} />
            <Row
              label="Total sales"
              value={formatEGP(report.totalSales)}
              emphasize
            />
            <Row label="Tickets" value={String(report.ticketCount)} />
          </div>

          <div className="rounded-xl bg-slate-900 px-4 py-4 text-white">
            <p className="text-sm text-slate-300">Expected cash in drawer</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">
              {formatEGP(report.expectedCash)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Starting cash + cash sales
            </p>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">
              Actual cash counted (EGP)
            </span>
            <PosKeyboardInput
              inputName="z-actual-cash"
              mode="numpad"
              type="text"
              inputMode="none"
              value={actualCashInput}
              onChange={setActualCashInput}
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-xl font-bold tabular-nums focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </label>

          <div
            className={clsx(
              "flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold",
              Math.abs(variance) < 0.01
                ? "bg-emerald-50 text-emerald-800"
                : variance > 0
                  ? "bg-amber-50 text-amber-900"
                  : "bg-red-50 text-red-800",
            )}
          >
            <span>Variance</span>
            <span className="tabular-nums">
              {variance > 0 ? "+" : ""}
              {formatEGP(variance)}
            </span>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
        </PosKeyboardScrollArea>

        <div className="flex shrink-0 gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={() => {
              kb?.close();
              onClose();
            }}
            disabled={isClosing}
            className="flex-1 rounded-xl border border-slate-200 py-3 font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isClosing}
            className={clsx(
              "flex-1 rounded-xl py-3 font-semibold text-white",
              isClosing ? "bg-slate-300" : "bg-red-600 hover:bg-red-700",
            )}
          >
            {isClosing ? "Closing…" : "Close & Deposit to Treasury"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={clsx(
        "flex items-center justify-between gap-3 py-1 text-sm",
        emphasize && "font-semibold text-slate-900",
      )}
    >
      <span className="text-slate-600">{label}</span>
      <span className="tabular-nums text-slate-900">{value}</span>
    </div>
  );
}
