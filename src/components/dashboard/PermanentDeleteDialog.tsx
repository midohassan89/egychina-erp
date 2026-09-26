"use client";

import { AlertTriangle } from "lucide-react";
import type { AdminProductRow } from "@/types/adminProduct";

interface PermanentDeleteDialogProps {
  product: AdminProductRow;
  open: boolean;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function PermanentDeleteDialog({
  product,
  open,
  isDeleting,
  onClose,
  onConfirm,
}: PermanentDeleteDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        aria-label="Close"
        onClick={onClose}
        disabled={isDeleting}
      />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-red-200 bg-white shadow-xl">
        <div className="border-b border-red-100 bg-red-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <div>
              <h2 className="text-lg font-semibold text-red-900">
                هل أنت متأكد من الحذف النهائي؟
              </h2>
              <p className="mt-1 text-sm text-red-800/80">
                سيتم حذف{" "}
                <span className="font-semibold">{product.name}</span> من قاعدة
                البيانات ولن يمكن استعادته.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={isDeleting}
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            إلغاء
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {isDeleting ? "جارٍ الحذف…" : "حذف نهائي"}
          </button>
        </div>
      </div>
    </div>
  );
}
