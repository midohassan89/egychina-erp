"use client";

import { useRef, type ChangeEvent } from "react";
import { Camera, FolderOpen, ImagePlus, Loader2 } from "lucide-react";
import { useProductImage } from "@/hooks/useProductImage";

interface ImagePickerProps {
  value: string;
  productName: string;
  /** When set, successful "fetch from internet" also updates the product row. */
  productId?: string;
  onChange: (url: string) => void;
}

const ACCEPT = "image/png, image/jpeg, image/webp";

/**
 * Shared product image control for:
 * - Add New Product
 * - Edit Product
 * - Add Product (Purchases quick-add)
 *
 * "جلب من الإنترنت" → POST /api/admin/fetch-image (5-URL fallback loop + sharp).
 */
export function ImagePicker({
  value,
  productName,
  productId,
  onChange,
}: ImagePickerProps) {
  const browseRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const {
    fetching,
    uploading,
    busy,
    error,
    clearError,
    fetchFromInternet,
    uploadFromDevice,
  } = useProductImage();

  async function handleFetchFromWeb() {
    const imageUrl = await fetchFromInternet(productName, productId);
    if (imageUrl) onChange(imageUrl);
  }

  async function handleUpload(file: File) {
    const imageUrl = await uploadFromDevice(file);
    if (imageUrl) onChange(imageUrl);
  }

  function onFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void handleUpload(file);
  }

  return (
    <div className="space-y-3">
      <div className="relative flex h-40 w-40 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-200 bg-slate-50">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <ImagePlus className="h-8 w-8 text-slate-300" />
        )}
        {fetching && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-white/80 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
            <span className="px-2 text-[11px] font-medium text-slate-600">
              جاري البحث عن صورة…
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleFetchFromWeb()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {fetching && <Loader2 className="h-4 w-4 animate-spin" />}
          جلب من الإنترنت
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => browseRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FolderOpen className="h-4 w-4" />
          )}
          تصفح الملفات
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => cameraRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <Camera className="h-4 w-4" />
          كاميرا
        </button>
        <button
          type="button"
          disabled={busy || !value}
          onClick={() => {
            clearError();
            onChange("");
          }}
          className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          حذف
        </button>
      </div>

      <input
        ref={browseRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={onFileSelected}
      />
      <input
        ref={cameraRef}
        type="file"
        accept={ACCEPT}
        capture="environment"
        className="hidden"
        onChange={onFileSelected}
      />

      {error && (
        <p className="rounded-lg border border-red-100 bg-red-50 px-2.5 py-2 text-xs leading-relaxed text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
