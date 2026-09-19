"use client";

import { AlertTriangle } from "lucide-react";
import type { AdminProductRow } from "@/types/adminProduct";

interface PermanentDeleteDialogProps {
  product: AdminProductRow;
  open: boolean;
  isDeleting: boolean;
  onClose: () => void;
  onDeleteErpOnly: () => void;
  onDeleteBoth: () => void;
}

export function PermanentDeleteDialog({
  product,
  open,
  isDeleting,
  onClose,
  onDeleteErpOnly,
  onDeleteBoth,
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
                Permanently delete product?
              </h2>
              <p className="mt-1 text-sm text-red-800/80">
                This cannot be undone. Choose where to remove{" "}
                <span className="font-semibold">{product.name}</span>.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3 px-5 py-5">
          <button
            type="button"
            disabled={isDeleting}
            onClick={onDeleteErpOnly}
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            Delete from ERP only
            <span className="mt-0.5 block text-xs font-normal text-slate-500">
              Removes from the local database. WooCommerce product stays online.
            </span>
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={onDeleteBoth}
            className="w-full rounded-lg border border-red-300 bg-red-600 px-4 py-3 text-left text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            Delete from ERP &amp; WooCommerce
            <span className="mt-0.5 block text-xs font-normal text-red-100">
              Force-deletes on WooCommerce (force=true) and removes from ERP.
            </span>
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={onClose}
            className="w-full rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
