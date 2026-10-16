"use client";

import { X } from "lucide-react";
import type { AdminProductRow } from "@/types/adminProduct";
import {
  ProductForm,
  type ProductFormValues,
} from "@/components/products/ProductForm";

interface ProductEditModalProps {
  product: AdminProductRow;
  open: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: (values: ProductFormValues) => Promise<void>;
}

export function ProductEditModal({
  product,
  open,
  isSaving,
  onClose,
  onSave,
}: ProductEditModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        aria-label="Close"
        onClick={onClose}
        disabled={isSaving}
      />
      <div className="relative z-10 flex max-h-[min(90dvh,820px)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-gray-100">
              تعديل المنتج
            </h2>
            <p className="text-xs text-slate-400 dark:text-gray-500">WC #{product.wcId}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <ProductForm
          key={product.id}
          initialData={product}
          isLoading={isSaving}
          onCancel={onClose}
          submitLabel="حفظ"
          onSubmit={onSave}
          className="min-h-0 flex-1 overflow-y-auto px-5 py-5"
        />
      </div>
    </div>
  );
}
