"use client";

import { useMemo } from "react";
import { X } from "lucide-react";
import {
  ProductForm,
  productFormToCreateFormData,
  type ProductFormInitial,
  type ProductFormValues,
} from "@/components/products/ProductForm";

export interface QuickAddedProduct {
  id: string;
  wcId: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  stockQuantity: number;
  price: number;
  salePrice: number | null;
  purchasePackSize?: number;
}

interface QuickAddProductModalProps {
  open: boolean;
  /** The search text that opened this dialog. */
  searchQuery: string;
  onClose: () => void;
  onCreated: (product: QuickAddedProduct) => void;
}

function isNumericQuery(value: string): boolean {
  return /^\d+$/.test(value.trim());
}

export function QuickAddProductModal({
  open,
  searchQuery,
  onClose,
  onCreated,
}: QuickAddProductModalProps) {
  const initialData = useMemo<ProductFormInitial>(() => {
    const query = searchQuery.trim();
    if (isNumericQuery(query)) return { barcode: query, name: "" };
    return { name: query, barcode: "" };
  }, [searchQuery]);

  if (!open) return null;

  async function handleSubmit(values: ProductFormValues) {
    const res = await fetch("/api/products/create", {
      method: "POST",
      body: productFormToCreateFormData(values),
    });
    const body = (await res.json()) as {
      error?: string;
      product?: QuickAddedProduct;
    };
    if (!res.ok || !body.product) {
      throw new Error(body.error ?? "تعذر إنشاء المنتج");
    }
    onCreated(body.product);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="flex max-h-[min(92dvh,820px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              إضافة منتج جديد
            </h2>
            <p className="text-sm text-slate-500">
              يُنشأ في النظام ثم يُضاف إلى هذه الفاتورة.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <ProductForm
          key={searchQuery}
          initialData={initialData}
          onSubmit={handleSubmit}
          onCancel={onClose}
          submitLabel="إنشاء المنتج"
          autoFocusName
          className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
        />
      </div>
    </div>
  );
}
