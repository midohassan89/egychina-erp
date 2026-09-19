"use client";

import { useCallback, useEffect, useState } from "react";
import { roundMoney } from "@/lib/pos/money";
import { cashierShiftToZReport } from "@/lib/shifts/zReportFromShift";
import type {
  CashierShift,
  ZReportSummary,
} from "@/types/woocommerce";

/**
 * Server-backed POS shift (Prisma) — open/close sync to Treasury on Z-report.
 */
export function useShift() {
  const [shift, setShift] = useState<CashierShift | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/shifts/current");
    if (!res.ok) {
      setShift(null);
      return null;
    }
    const body = (await res.json()) as { shift?: CashierShift | null };
    const next = body.shift ?? null;
    setShift(next);
    return next;
  }, []);

  useEffect(() => {
    refresh().finally(() => setIsLoading(false));
  }, [refresh]);

  const openShift = useCallback(async (startingCash: number) => {
    const amount = roundMoney(Math.max(0, startingCash));
    const res = await fetch("/api/shifts/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startingCash: amount }),
    });
    const body = (await res.json()) as {
      error?: string;
      shift?: CashierShift;
    };
    if (!res.ok || !body.shift) {
      throw new Error(body.error ?? "Could not open shift");
    }
    setShift(body.shift);
    return body.shift;
  }, []);

  const buildCurrentZReport = useCallback(async (): Promise<ZReportSummary | null> => {
    const active = shift ?? (await refresh());
    if (!active || active.status !== "open") return null;
    return cashierShiftToZReport(active);
  }, [shift, refresh]);

  const closeShift = useCallback(
    async (
      actualCash: number,
    ): Promise<{
      variance: number;
      expectedCash: number;
      treasuryBalance: number;
      report: ZReportSummary;
    }> => {
      const res = await fetch("/api/shifts/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actualCash: roundMoney(actualCash),
          shiftId: shift?.id,
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        shift?: CashierShift;
        expectedCash?: number;
        actualCash?: number;
        variance?: number;
        treasuryBalance?: number;
      };
      if (!res.ok || !body.shift) {
        throw new Error(body.error ?? "Could not close shift");
      }

      const report = cashierShiftToZReport(
        {
          ...body.shift,
          expectedCash: body.expectedCash ?? body.shift.expectedCash,
          actualCash: body.actualCash ?? body.shift.actualCash,
          variance: body.variance ?? body.shift.variance,
        },
        body.shift.endedAt ?? new Date().toISOString(),
      );

      setShift(null);
      return {
        variance: body.variance ?? 0,
        expectedCash: body.expectedCash ?? 0,
        treasuryBalance: body.treasuryBalance ?? 0,
        report,
      };
    },
    [shift],
  );

  const applyCashSalesUpdate = useCallback((next: CashierShift) => {
    setShift(next);
  }, []);

  return {
    shift,
    isLoading,
    isOpen: shift?.status === "open",
    openShift,
    closeShift,
    buildCurrentZReport,
    refresh,
    applyCashSalesUpdate,
  };
}
