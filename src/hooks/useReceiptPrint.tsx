"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LocalSale, ZReportSummary } from "@/types/woocommerce";
import { ReceiptTicket } from "@/components/pos/ReceiptTicket";
import { ZReportTicket } from "@/components/pos/ZReportTicket";
import { printIsolatedReceipt } from "@/lib/pos/printIsolatedReceipt";

type PrintJob =
  | { kind: "sale"; sale: LocalSale }
  | { kind: "zreport"; report: ZReportSummary };

/**
 * Thermal print jobs: sale receipts (isolated iframe) and Z-Reports.
 */
export function useReceiptPrint() {
  const [job, setJob] = useState<PrintJob | null>(null);
  const pendingPrintRef = useRef(false);
  const afterPrintCallbackRef = useRef<(() => void) | null>(null);

  const printReceipt = useCallback(
    (sale: LocalSale, onAfterPrint?: () => void) => {
      // Caller schedules timing; never returns a Promise the POS awaits.
      try {
        printIsolatedReceipt(sale, onAfterPrint);
      } catch {
        onAfterPrint?.();
      }
    },
    [],
  );

  /**
   * Print Z-Report then optionally run a callback after the print dialog closes.
   */
  const printZReport = useCallback(
    (report: ZReportSummary, onAfterPrint?: () => void) => {
      afterPrintCallbackRef.current = onAfterPrint ?? null;
      pendingPrintRef.current = true;
      document.documentElement.classList.remove("printing-labels");
      setJob({ kind: "zreport", report });
    },
    [],
  );

  useEffect(() => {
    if (!job || job.kind !== "zreport" || !pendingPrintRef.current) return;
    pendingPrintRef.current = false;

    const id = window.setTimeout(() => {
      window.print();
    }, 150);

    return () => window.clearTimeout(id);
  }, [job]);

  useEffect(() => {
    const onAfterPrint = () => {
      pendingPrintRef.current = false;
      const cb = afterPrintCallbackRef.current;
      afterPrintCallbackRef.current = null;
      cb?.();
      setJob(null);
    };
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, []);

  const receiptNode = (
    <>
      <ReceiptTicket sale={null} />
      <ZReportTicket report={job?.kind === "zreport" ? job.report : null} />
    </>
  );

  return { printReceipt, printZReport, receiptNode };
}
