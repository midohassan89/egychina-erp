"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";

interface ImagePickerProps {
  value: string;
  productName: string;
  onChange: (url: string) => void;
}

export function ImagePicker({ value, productName, onChange }: ImagePickerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fetching, setFetching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = fetching || uploading;

  async function fetchFromWeb() {
    const name = productName.trim();
    if (!name) {
      setError("أدخل اسم المنتج أولاً");
      return;
    }
    setError(null);
    setFetching(true);
    try {
      const res = await fetch("/api/admin/fetch-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productName: name }),
      });
      const body = (await res.json()) as { error?: string; imageUrl?: string };
      if (!res.ok || !body.imageUrl) {
        throw new Error(body.error ?? "Could not fetch image");
      }
      onChange(body.imageUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not fetch image");
    } finally {
      setFetching(false);
    }
  }

  async function uploadFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/admin/upload-image", {
        method: "POST",
        body: form,
      });
      const body = (await res.json()) as { error?: string; imageUrl?: string };
      if (!res.ok || !body.imageUrl) {
        throw new Error(body.error ?? "Upload failed");
      }
      onChange(body.imageUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-200 bg-slate-50">
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
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void fetchFromWeb()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {fetching && <Loader2 className="h-4 w-4 animate-spin" />}
          جلب من الإنترنت
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
          رفع صورة
        </button>
        <button
          type="button"
          disabled={busy || !value}
          onClick={() => {
            setError(null);
            onChange("");
          }}
          className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          حذف
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void uploadFile(file);
        }}
      />

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
