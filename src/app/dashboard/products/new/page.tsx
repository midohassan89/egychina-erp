"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  ImagePlus,
  Loader2,
  Shuffle,
  ScanLine,
} from "lucide-react";
import { BarcodeScannerModal } from "@/components/dashboard/BarcodeScannerModal";
import { VirtualBundleLinkFields } from "@/components/dashboard/VirtualBundleLinkFields";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import {
  checkBarcodeAvailable,
  generateUniqueErpBarcode,
} from "@/lib/products/barcode";
import imageCompression from "browser-image-compression";
import { clsx } from "clsx";

export default function NewProductPage() {
  return (
    <ToastProvider>
      <NewProductForm />
    </ToastProvider>
  );
}

function NewProductForm() {
  const router = useRouter();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [barcode, setBarcode] = useState("");
  const [stockStatus, setStockStatus] = useState<"instock" | "outofstock">(
    "instock",
  );
  const [isBundle, setIsBundle] = useState(false);
  const [linkedProductId, setLinkedProductId] = useState("");
  const [bundleMultiplier, setBundleMultiplier] = useState("3");
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [barcodeChecking, setBarcodeChecking] = useState(false);
  const [barcodeVerified, setBarcodeVerified] = useState(false);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/categories");
      if (!res.ok) return;
      const body = (await res.json()) as {
        categories?: { id: string; name: string }[];
      };
      setCategories(body.categories ?? []);
    })();
  }, []);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const regular = useMemo(() => parseFloat(price), [price]);
  const sale = useMemo(() => {
    const t = salePrice.trim();
    if (!t) return null;
    return parseFloat(t);
  }, [salePrice]);

  useEffect(() => {
    if (sale == null) {
      setSaleError(null);
      return;
    }
    if (!Number.isFinite(sale) || sale < 0) {
      setSaleError("Enter a valid sale price");
      return;
    }
    if (Number.isFinite(regular) && sale > 0 && sale >= regular) {
      setSaleError("Sale price must be less than the regular price");
      return;
    }
    setSaleError(null);
  }, [sale, regular]);

  const validateBarcode = useCallback(async (value: string) => {
    const normalized = value.trim();
    if (!normalized) {
      setBarcodeError("Barcode is required");
      setBarcodeVerified(false);
      return false;
    }
    setBarcodeChecking(true);
    setBarcodeError(null);
    setBarcodeVerified(false);
    try {
      const result = await checkBarcodeAvailable(normalized);
      if (!result.available) {
        setBarcodeError(result.error ?? "This barcode already exists");
        setBarcodeVerified(false);
        return false;
      }
      setBarcodeError(null);
      setBarcodeVerified(true);
      return true;
    } catch {
      setBarcodeError("Could not verify barcode");
      setBarcodeVerified(false);
      return false;
    } finally {
      setBarcodeChecking(false);
    }
  }, []);

  async function handleGenerateBarcode() {
    setGenerating(true);
    setBarcodeError(null);
    setBarcodeVerified(false);
    try {
      const next = await generateUniqueErpBarcode();
      setBarcode(next);
      setBarcodeVerified(true);
      toast("Unique barcode generated", "success");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Failed to generate barcode",
        "error",
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      toast("Product name is required", "error");
      return;
    }
    if (!Number.isFinite(regular) || regular < 0) {
      toast("Enter a valid regular price", "error");
      return;
    }
    if (saleError) {
      toast(saleError, "error");
      return;
    }

    const ok = await validateBarcode(barcode);
    if (!ok) {
      toast(barcodeError ?? "Barcode is invalid or already used", "error");
      return;
    }

    if (isBundle) {
      if (!linkedProductId) {
        toast("Select the base single-unit product for this bundle", "error");
        return;
      }
      const mult = Math.floor(Number(bundleMultiplier));
      if (!Number.isFinite(mult) || mult < 1) {
        toast("Bundle multiplier must be at least 1 (e.g. 3)", "error");
        return;
      }
    }

    setSubmitting(true);
    try {
      const form = new FormData();
      form.set("name", name.trim());
      form.set("price", String(regular));
      if (sale != null && sale > 0) form.set("salePrice", String(sale));
      form.set("barcode", barcode.trim());
      if (isBundle) {
        form.set("linkedProductId", linkedProductId);
        form.set("bundleMultiplier", String(Math.floor(Number(bundleMultiplier))));
        form.set("stockStatus", "instock");
      } else {
        form.set("stockStatus", stockStatus);
      }
      form.set("stockQuantity", "0");
      if (categoryId) form.set("categoryId", categoryId);

      let savedImageUrl = imageUrl;
      if (imageFile) {
        setCompressing(true);
        try {
          const compressed = await imageCompression(imageFile, {
            maxSizeMB: 0.05,
            maxWidthOrHeight: 800,
            useWebWorker: true,
            fileType: "image/jpeg",
          });
          const uploadFile =
            compressed instanceof File
              ? compressed
              : new File(
                  [compressed],
                  imageFile.name.replace(/\.\w+$/, "") + ".jpg",
                  { type: "image/jpeg" },
                );
          const uploadBody = new FormData();
          uploadBody.set("image", uploadFile);
          const uploadRes = await fetch("/api/admin/upload", {
            method: "POST",
            body: uploadBody,
          });
          const uploadData = (await uploadRes.json()) as {
            url?: string;
            error?: string;
          };
          if (!uploadRes.ok || !uploadData.url) {
            throw new Error(uploadData.error ?? "Image upload failed");
          }
          savedImageUrl = uploadData.url;
          setImageUrl(uploadData.url);
        } catch (err) {
          throw new Error(
            err instanceof Error ? err.message : "Image upload failed",
          );
        } finally {
          setCompressing(false);
        }
      }
      if (savedImageUrl) form.set("imageUrl", savedImageUrl);

      const res = await fetch("/api/products/create", {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to create product");
      }

      toast(data.message ?? "Product created", "success");
      router.push("/dashboard/products");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Create failed", "error");
    } finally {
      setCompressing(false);
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/products"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Create New Product
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Saves to the local ERP database
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
      >
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">
            Product Name
          </span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            placeholder="e.g. Olive Oil 1L"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Category</span>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="">No category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">
              Regular Price (EGP)
            </span>
            <input
              required
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">
              Sale Price (optional)
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              className={clsx(
                "w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2",
                saleError
                  ? "border-red-400 focus:border-red-500 focus:ring-red-500/20"
                  : "border-slate-300 focus:border-brand-500 focus:ring-brand-500/20",
              )}
              placeholder="Must be less than regular"
            />
            {saleError && (
              <span className="text-xs text-red-600">{saleError}</span>
            )}
          </label>
        </div>

        <div className="space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Barcode</span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              required
              value={barcode}
              onChange={(e) => {
                setBarcode(e.target.value);
                setBarcodeError(null);
                setBarcodeVerified(false);
              }}
              onBlur={() => {
                if (barcode.trim()) void validateBarcode(barcode);
              }}
              className={clsx(
                "w-full rounded-lg border px-3 py-2.5 font-mono text-sm outline-none focus:ring-2",
                barcodeError
                  ? "border-red-400 focus:border-red-500 focus:ring-red-500/20"
                  : "border-slate-300 focus:border-brand-500 focus:ring-brand-500/20",
              )}
              placeholder="Scan, type, or generate (99…)"
            />
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <ScanLine className="h-4 w-4" />
                Scan
              </button>
              <button
                type="button"
                disabled={generating}
                onClick={() => void handleGenerateBarcode()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Shuffle className="h-4 w-4" />
                )}
                Generate
              </button>
            </div>
          </div>
          {barcodeChecking && (
            <p className="text-xs text-slate-400">Checking barcode…</p>
          )}
          {barcodeError && (
            <p className="text-xs text-red-600">{barcodeError}</p>
          )}
          {barcodeVerified && !barcodeError && !barcodeChecking && (
            <p className="text-xs text-emerald-600">Barcode is available</p>
          )}
        </div>

        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <div className="flex items-start gap-3">
            <input
              id="create-product-is-bundle"
              type="checkbox"
              checked={isBundle}
              onChange={(e) => setIsBundle(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <label
              htmlFor="create-product-is-bundle"
              className="cursor-pointer select-none"
            >
              <span className="block text-sm font-semibold text-slate-800">
                Is this a Bundle/Pack? (Virtual Product)
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                Sell with a pack barcode while inventory is tracked only on the
                single base unit.
              </span>
            </label>
          </div>

          {isBundle ? (
            <VirtualBundleLinkFields
              linkedProductId={linkedProductId}
              onLinkedProductIdChange={setLinkedProductId}
              bundleMultiplier={bundleMultiplier}
              onBundleMultiplierChange={setBundleMultiplier}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">
                  Stock Quantity
                </span>
                <input
                  type="number"
                  readOnly
                  value="0"
                  className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-gray-100 px-3 py-2.5 text-sm text-gray-500 outline-none"
                />
                <span className="block text-xs text-gray-500">
                  الرصيد للعرض فقط. لتعديل الرصيد، يرجى استخدام (أرصدة أول المدة) أو (فواتير المشتريات) للحفاظ على دقة كارت الصنف.
                </span>
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">
                  Stock Status
                </span>
                <select
                  value={stockStatus}
                  onChange={(e) =>
                    setStockStatus(e.target.value as "instock" | "outofstock")
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                >
                  <option value="instock">In Stock</option>
                  <option value="outofstock">Out of Stock</option>
                </select>
              </label>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <span className="text-sm font-medium text-slate-700">
            Product Image
          </span>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center hover:border-brand-400 hover:bg-brand-50/40 sm:min-w-[200px]">
              <Camera className="h-6 w-6 text-slate-400" />
              <span className="text-sm font-medium text-slate-700">
                Take photo / choose file
              </span>
              <span className="text-xs text-slate-400">
                Uses rear camera on mobile
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setImageFile(file);
                  setImageUrl(null);
                }}
              />
            </label>
            {imagePreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imagePreview}
                alt="Preview"
                className="h-40 w-40 rounded-xl border border-slate-200 object-cover"
              />
            ) : (
              <div className="flex h-40 w-40 items-center justify-center rounded-xl border border-dashed border-slate-200 text-slate-300">
                <ImagePlus className="h-8 w-8" />
              </div>
            )}
          </div>
          {imageFile && (
            <button
              type="button"
              className="text-xs text-slate-500 underline hover:text-slate-800"
              onClick={() => {
                setImageFile(null);
                setImageUrl(null);
              }}
            >
              Remove image
            </button>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          <Link
            href="/dashboard/products"
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={
              submitting ||
              compressing ||
              Boolean(saleError) ||
              Boolean(barcodeError)
            }
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {(submitting || compressing) && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {compressing
              ? "Compressing image…"
              : submitting
                ? "Creating…"
                : "Create Product"}
          </button>
        </div>
      </form>

      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(value) => {
          setBarcode(value);
          void validateBarcode(value);
          toast("Barcode scanned", "success");
        }}
      />
    </div>
  );
}
