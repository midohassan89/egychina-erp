"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

interface ProductNotFoundModalProps {
  barcode: string;
  onDismiss: () => void;
}

/**
 * Blocking alert — cashier must click OK / Enter / Escape before scanning again.
 */
export function ProductNotFoundModal({
  barcode,
  onDismiss,
}: ProductNotFoundModalProps) {
  const okRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    okRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onDismiss();
      }
    }

    // Capture so scanner Enter doesn't leak into the search field.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onDismiss]);

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-red-950/80 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="pos-not-found-title"
      onMouseDown={(e) => {
        // Block clicks from reaching the POS underneath.
        e.stopPropagation();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl border-4 border-red-500 bg-white shadow-2xl">
        <div className="flex items-start gap-4 border-b border-red-200 bg-red-600 px-6 py-5 text-white">
          <AlertTriangle className="mt-0.5 h-10 w-10 shrink-0" strokeWidth={2.5} />
          <div>
            <h2
              id="pos-not-found-title"
              className="text-2xl font-extrabold tracking-tight"
            >
              Product Not Found
            </h2>
            <p className="mt-1 text-base font-semibold text-red-100">
              منتج غير موجود — يجب تأكيد الخطأ قبل المتابعة
            </p>
          </div>
        </div>

        <div className="space-y-4 px-6 py-6">
          <p className="text-lg font-bold text-slate-900">
            Product Not Found:{" "}
            <span className="font-mono text-red-700">{barcode}</span>
          </p>
          <p className="text-sm text-slate-600">
            Acknowledge this error before scanning the next item. Do not skip
            unrecorded products.
          </p>

          <button
            ref={okRef}
            type="button"
            onClick={onDismiss}
            className="w-full rounded-xl bg-red-600 py-4 text-xl font-extrabold text-white hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-400"
          >
            OK · موافق
          </button>
          <p className="text-center text-xs text-slate-400">
            Press Enter or Escape to dismiss
          </p>
        </div>
      </div>
    </div>
  );
}
