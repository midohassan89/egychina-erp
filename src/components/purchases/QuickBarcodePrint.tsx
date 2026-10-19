"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { formatEGP } from "@/lib/pos/money";

const Barcode = dynamic(() => import("react-barcode"), { ssr: false });

const STORE_NAME = "ايجي شاينا ماركت";

export function QuickBarcodePrint({
  name,
  barcode,
  price,
  defaultCopies,
  onClose,
}: {
  name: string;
  barcode: string;
  price: number;
  defaultCopies: number;
  onClose: () => void;
}) {
  const [copies, setCopies] = useState(String(Math.max(1, defaultCopies)));
  const count = Math.max(1, Math.min(200, Math.trunc(Number(copies)) || 1));
  const labels = useMemo(
    () => Array.from({ length: count }, (_, index) => index),
    [count],
  );

  function printLabels() {
    document.documentElement.classList.add("printing-labels");
    const cleanup = () => {
      document.documentElement.classList.remove("printing-labels");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.setTimeout(() => window.print(), 50);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="dashboard-print-hide w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-800">
        <h2 className="text-lg font-bold text-slate-900 dark:text-gray-100">طباعة باركود</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-gray-300">{name}</p>
        {!barcode ? (
          <p className="mt-4 text-sm text-red-600">لا يوجد باركود لهذا الصنف</p>
        ) : (
          <>
            <label className="mt-4 block text-sm font-medium text-slate-700 dark:text-gray-200">
              عدد الملصقات
              <input
                type="number"
                min={1}
                max={200}
                value={copies}
                onChange={(event) => setCopies(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-100"
              />
            </label>
            <div className="mt-4 flex justify-center">
              <div className="thermal-label-preview w-[50mm] rounded border border-dashed border-slate-300 bg-white px-1 py-1 text-center" dir="rtl">
                <p className="text-[9px] font-bold">{STORE_NAME}</p>
                <p className="line-clamp-2 text-[8px]">{name}</p>
                <p className="text-[10px] font-bold">{formatEGP(price)}</p>
                <Barcode value={barcode} width={1.2} height={28} fontSize={10} margin={0} displayValue />
              </div>
            </div>
          </>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-sm text-slate-600 dark:text-gray-300">
            إغلاق
          </button>
          <button
            type="button"
            disabled={!barcode}
            onClick={printLabels}
            className="rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            طباعة
          </button>
        </div>
      </div>
      <div className="thermal-label-sheet" aria-hidden>
        {barcode
          ? labels.map((index) => (
              <div key={index} className="thermal-label" dir="rtl">
                <p className="label-store">{STORE_NAME}</p>
                <p className="label-name">{name}</p>
                <p className="label-price">{formatEGP(price)}</p>
                <div className="label-barcode">
                  <Barcode value={barcode} width={1.4} height={36} fontSize={11} margin={2} displayValue />
                </div>
              </div>
            ))
          : null}
      </div>
    </div>
  );
}
