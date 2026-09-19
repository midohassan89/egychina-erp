"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LocalSale, ZReportSummary } from "@/types/woocommerce";
import { ReceiptTicket } from "@/components/pos/ReceiptTicket";
import { ZReportTicket } from "@/components/pos/ZReportTicket";

type PrintJob =
  | { kind: "sale"; sale: LocalSale }
  | { kind: "zreport"; report: ZReportSummary };

/**
 * Thermal print jobs: sale receipts and Z-Reports.
 */
export function useReceiptPrint() {
  const [job, setJob] = useState<PrintJob | null>(null);
  const pendingPrintRef = useRef(false);
  const afterPrintCallbackRef = useRef<(() => void) | null>(null);

  const printReceipt = useCallback((sale: LocalSale) => {
    afterPrintCallbackRef.current = null;
    pendingPrintRef.current = true;
    document.documentElement.classList.remove("printing-labels");
    setJob({ kind: "sale", sale });
  }, []);

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
    if (!job || !pendingPrintRef.current) return;
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
    };
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, []);

  const receiptNode = (
    <>
      <ReceiptTicket sale={job?.kind === "sale" ? job.sale : null} />
      <ZReportTicket report={job?.kind === "zreport" ? job.report : null} />
    </>
  );

  return { printReceipt, printZReport, receiptNode };
}
