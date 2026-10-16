"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Pencil, X } from "lucide-react";
import { SafeImage } from "@/components/ui/SafeImage";
import {
  ProductForm,
  type ProductFormInitial,
  type ProductFormValues,
} from "@/components/products/ProductForm";

export interface PurchaseProductSnapshot {
  name: string;
  imageUrl: string | null;
  price: number;
  salePrice: number | null;
  packages: { price: number | null }[];
}

type EditableProduct = ProductFormInitial & {
  id: string;
  wcId?: number;
};

export function PurchaseLineProduct({
  productId,
  name,
  imageUrl,
  showImage = true,
  disabled,
  onUpdated,
}: {
  productId: string;
  name: string;
  imageUrl?: string | null;
  showImage?: boolean;
  disabled?: boolean;
  onUpdated: (product: PurchaseProductSnapshot) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [product, setProduct] = useState<EditableProduct | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saving]);

  async function openEditor() {
    setOpen(true);
    setLoading(true);
    setLoadError(null);
    setProduct(null);
    try {
      const res = await fetch(
        `/api/products?page=1&perPage=1&ids=${encodeURIComponent(productId)}`,
      );
      const body = (await res.json()) as {
        error?: string;
        products?: EditableProduct[];
      };
      const row = body.products?.[0];
      if (!res.ok || !row?.id) {
        throw new Error(body.error ?? "تعذر تحميل المنتج");
      }
      setProduct(row);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "تعذر تحميل المنتج");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(values: ProductFormValues) {
    setSaving(true);
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          barcode: values.barcode || null,
          price: values.price,
          salePrice: values.salePrice,
          categoryId: values.categoryId,
          brandId: values.brandId,
          imageUrl: values.imageUrl || null,
          nameEn: values.nameEn,
          nameZh: values.nameZh,
          isWeighed: values.isWeighed,
          isActive: values.isActive,
          packages: values.packages,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        product?: {
          name?: string;
          imageUrl?: string | null;
          price?: number;
          salePrice?: number | null;
          packages?: { price: number | null }[];
        };
      };
      if (!res.ok) throw new Error(data.error ?? "تعذر حفظ المنتج");
      const saved = data.product;
      onUpdated({
        name: saved?.name ?? values.name,
        imageUrl: saved?.imageUrl ?? (values.imageUrl || null),
        price: saved?.price ?? values.price,
        salePrice:
          saved && "salePrice" in saved ? (saved.salePrice ?? null) : values.salePrice,
        packages: saved?.packages ?? values.packages,
      });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  const dialog =
    open && typeof document !== "undefined"
      ? createPortal(
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <button
              type="button"
              className="absolute inset-0 bg-slate-900/50"
              aria-label="إغلاق"
              disabled={saving}
              onClick={() => setOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="تعديل المنتج"
              className="relative z-10 flex max-h-[min(92dvh,900px)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-gray-800">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-gray-100">
                    تعديل المنتج
                  </h2>
                  <p className="truncate text-xs text-slate-400 dark:text-gray-500">
                    {product?.wcId != null ? `WC #${product.wcId} · ` : ""}
                    {name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={saving}
                  aria-label="إغلاق"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {loading ? (
                <div className="flex items-center justify-center gap-2 px-5 py-16 text-sm text-slate-500 dark:text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جاري تحميل المنتج…
                </div>
              ) : loadError ? (
                <p className="px-5 py-10 text-sm text-red-700 dark:text-red-300">{loadError}</p>
              ) : product ? (
                <ProductForm
                  key={product.id}
                  initialData={product}
                  isLoading={saving}
                  onCancel={() => setOpen(false)}
                  submitLabel="حفظ"
                  onSubmit={handleSubmit}
                  className="min-h-0 flex-1 overflow-y-auto px-5 py-5"
                />
              ) : null}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {showImage ? (
        imageUrl ? (
          <SafeImage
            src={imageUrl}
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="h-8 w-8 shrink-0 rounded bg-slate-100 dark:bg-gray-800"
          />
        )
      ) : null}
      <span className="min-w-0 flex-1 truncate leading-snug" title={name}>
        {name}
      </span>
      <button
        type="button"
        onClick={() => void openEditor()}
        disabled={disabled}
        aria-label="تعديل المنتج"
        title="تعديل المنتج"
        className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-200"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      {dialog}
    </div>
  );
}
