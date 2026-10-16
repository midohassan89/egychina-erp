"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Barcode, Copy, Globe, Loader2, ScanLine, Shuffle, TriangleAlert } from "lucide-react";
import { clsx } from "clsx";
import { BarcodeScannerModal } from "@/components/dashboard/BarcodeScannerModal";
import { BrandSelect } from "@/components/dashboard/BrandSelect";
import { CategorySelect } from "@/components/dashboard/CategorySelect";
import {
  packageDraftsFromRows,
  packageDraftsToPayload,
  ProductPackagesFields,
  validatePackageDrafts,
  type PackageDraft,
} from "@/components/dashboard/ProductPackagesFields";
import { MarginPills, pricesFromMargin } from "@/components/pricing/MarginPills";
import { ImagePicker } from "@/components/ui/ImagePicker";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import {
  checkBarcodeAvailable,
  generateUniqueErpBarcode,
} from "@/lib/products/barcode";

export interface ProductFormPackage {
  barcode: string;
  name: string;
  nameEn: string | null;
  nameZh: string | null;
  packSize: number;
  price: number | null;
  isFavorite: boolean;
}

export interface ProductFormValues {
  name: string;
  nameEn: string;
  nameZh: string;
  barcode: string;
  price: number;
  salePrice: number | null;
  categoryId: string | null;
  brandId: string | null;
  imageUrl: string;
  isWeighed: boolean;
  isActive: boolean;
  packages: ProductFormPackage[];
}

/** Edit record, or a create preset such as a scanned barcode. */
export interface ProductFormInitial {
  id?: string;
  name?: string;
  nameEn?: string | null;
  nameZh?: string | null;
  sku?: string | null;
  barcode?: string | null;
  price?: number;
  salePrice?: number | null;
  buyingCost?: number | null;
  lastPurchasePrice?: number | null;
  stockQuantity?: number;
  stockStatus?: string;
  categoryId?: string | null;
  brandId?: string | null;
  imageUrl?: string | null;
  isWeighed?: boolean;
  isActive?: boolean;
  packages?: {
    id?: string;
    barcode: string;
    name: string;
    nameEn?: string | null;
    nameZh?: string | null;
    packSize: number;
    price: number | null;
    isFavorite?: boolean;
  }[];
}

export function productFormToCreateFormData(values: ProductFormValues): FormData {
  const form = new FormData();
  form.set("name", values.name);
  form.set("nameEn", values.nameEn);
  form.set("nameZh", values.nameZh);
  form.set("barcode", values.barcode);
  form.set("price", String(values.price));
  form.set("salePrice", values.salePrice != null ? String(values.salePrice) : "");
  form.set("isWeighed", values.isWeighed ? "true" : "false");
  form.set("isActive", values.isActive ? "true" : "false");
  if (values.categoryId) form.set("categoryId", values.categoryId);
  if (values.brandId) form.set("brandId", values.brandId);
  if (values.imageUrl) form.set("imageUrl", values.imageUrl);
  form.set("packages", JSON.stringify(values.packages));
  return form;
}

function samePriceInput(current: string, initial: string): boolean {
  const next = current.trim();
  const previous = initial.trim();
  if (next === previous) return true;
  if (!next || !previous) return false;
  const nextAmount = Number(next);
  const previousAmount = Number(previous);
  return (
    Number.isFinite(nextAmount) &&
    Number.isFinite(previousAmount) &&
    Math.round(nextAmount * 100) === Math.round(previousAmount * 100)
  );
}

function FieldToggle({
  checked,
  onChange,
  disabled,
  label,
  status,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  status?: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-700">
          {label}
          {status ? (
            <span
              className={clsx(
                "ms-2 text-xs font-semibold",
                checked ? "text-brand-700" : "text-gray-500",
              )}
            >
              {status}
            </span>
          ) : null}
        </span>
        <label className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer">
          <input
            type="checkbox"
            role="switch"
            aria-label={label}
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
            className="peer sr-only"
          />
          <span className="absolute inset-0 rounded-full bg-slate-200 transition peer-checked:bg-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/30 peer-disabled:opacity-50" />
          <span className="pointer-events-none absolute start-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all peer-checked:start-[22px]" />
        </label>
      </div>
      <p className="text-xs text-gray-500">{description}</p>
    </div>
  );
}

function ProductFormFields({
  initialData,
  onSubmit,
  isLoading = false,
  onCancel,
  cancelHref,
  submitLabel,
  autoFocusName = false,
  className,
}: {
  initialData?: ProductFormInitial | null;
  onSubmit: (data: ProductFormValues) => Promise<void> | void;
  isLoading?: boolean;
  onCancel?: () => void;
  cancelHref?: string;
  submitLabel?: string;
  autoFocusName?: boolean;
  className?: string;
}) {
  const isEdit = Boolean(initialData?.id);
  const originalBarcode = initialData?.barcode?.trim() ?? "";

  const [name, setName] = useState(initialData?.name ?? "");
  const [nameEn, setNameEn] = useState(initialData?.nameEn ?? "");
  const [nameZh, setNameZh] = useState(initialData?.nameZh ?? "");
  const [barcode, setBarcode] = useState(initialData?.barcode ?? "");
  const [price, setPrice] = useState(
    initialData?.price != null ? String(initialData.price) : "",
  );
  const [salePrice, setSalePrice] = useState(
    initialData?.salePrice != null && initialData.salePrice > 0
      ? String(initialData.salePrice)
      : "",
  );
  const [costPrice, setCostPrice] = useState(() => {
    const cost = initialData?.lastPurchasePrice ?? initialData?.buyingCost;
    return cost != null && Number.isFinite(cost) && cost > 0 ? String(cost) : "";
  });
  const [categoryId, setCategoryId] = useState(initialData?.categoryId ?? "");
  const [brandId, setBrandId] = useState(initialData?.brandId ?? "");
  const [imageUrl, setImageUrl] = useState(initialData?.imageUrl ?? "");
  const [isWeighed, setIsWeighed] = useState(Boolean(initialData?.isWeighed));
  const [isActive, setIsActive] = useState(initialData?.isActive !== false);
  const [packages, setPackages] = useState<PackageDraft[]>(() =>
    packageDraftsFromRows(initialData?.packages ?? [], initialData?.name ?? ""),
  );
  const [initialSellingPrices] = useState(() => ({
    price: initialData?.price != null ? String(initialData.price) : "",
    salePrice:
      initialData?.salePrice != null && initialData.salePrice > 0
        ? String(initialData.salePrice)
        : "",
  }));
  const [packageError, setPackageError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [barcodeChecking, setBarcodeChecking] = useState(false);
  const [barcodeVerified, setBarcodeVerified] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [fetchedOriginalName, setFetchedOriginalName] = useState<string | null>(null);
  const [fetchSource, setFetchSource] = useState<string | null>(null);
  const [retranslating, setRetranslating] = useState(false);
  const [savingWithTranslation, setSavingWithTranslation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const busy = isLoading || submitting || savingWithTranslation;
  const regular = useMemo(() => parseFloat(price), [price]);
  const sale = useMemo(() => {
    const trimmed = salePrice.trim();
    if (!trimmed) return null;
    return parseFloat(trimmed);
  }, [salePrice]);
  const saleError = useMemo(() => {
    if (sale == null) return null;
    if (!Number.isFinite(sale) || sale < 0) return "أدخل سعر تخفيض صالحاً";
    if (Number.isFinite(regular) && sale > 0 && sale >= regular) {
      return "يجب أن يكون سعر التخفيض أقل من السعر الأساسي";
    }
    return null;
  }, [sale, regular]);

  function applyMargin(marginPercent: number) {
    const next = pricesFromMargin(Number(costPrice), marginPercent);
    if (!next) return;
    setPrice(String(next.regular));
    setSalePrice(String(next.discounted));
  }

  const sellingPricesChanged =
    !samePriceInput(price, initialSellingPrices.price) ||
    !samePriceInput(salePrice, initialSellingPrices.salePrice);
  const hasCustomPackagePrice = packages.some(
    (row) => row.price.trim() !== "",
  );
  const showPackagePriceWarning = sellingPricesChanged && hasCustomPackagePrice;

  function resetPackagePrices() {
    setPackages((current) =>
      current.map((row) => (row.price.trim() === "" ? row : { ...row, price: "" })),
    );
  }

  const validateBarcode = useCallback(
    async (value: string): Promise<{ ok: boolean; error?: string }> => {
      const normalized = value.trim();
      if (!normalized) {
        if (isEdit) {
          setBarcodeError(null);
          setBarcodeVerified(false);
          return { ok: true };
        }
        const error = "الباركود مطلوب";
        setBarcodeError(error);
        setBarcodeVerified(false);
        return { ok: false, error };
      }
      if (isEdit && normalized === originalBarcode) {
        setBarcodeError(null);
        setBarcodeVerified(false);
        return { ok: true };
      }
      setBarcodeChecking(true);
      setBarcodeError(null);
      setBarcodeVerified(false);
      try {
        const result = await checkBarcodeAvailable(normalized);
        if (!result.available) {
          const error = result.error ?? "هذا الباركود مستخدم بالفعل";
          setBarcodeError(error);
          setBarcodeVerified(false);
          return { ok: false, error };
        }
        setBarcodeError(null);
        setBarcodeVerified(true);
        return { ok: true };
      } catch {
        const error = "تعذر التحقق من الباركود";
        setBarcodeError(error);
        setBarcodeVerified(false);
        return { ok: false, error };
      } finally {
        setBarcodeChecking(false);
      }
    },
    [isEdit, originalBarcode],
  );

  async function handleGenerateBarcode() {
    setGenerating(true);
    setBarcodeError(null);
    setBarcodeVerified(false);
    try {
      const next = await generateUniqueErpBarcode();
      setBarcode(next);
      setBarcodeVerified(true);
    } catch (err) {
      setBarcodeError(
        err instanceof Error ? err.message : "تعذر توليد الباركود",
      );
    } finally {
      setGenerating(false);
    }
  }

  function copyBarcodeFallback(barcodeValue: string) {
    const area = document.createElement("textarea");
    area.value = barcodeValue;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(area);
    return copied;
  }

  async function handleCopyBarcode() {
    const barcodeValue = barcode.trim();
    if (!barcodeValue) {
      toast("لا يوجد باركود لنسخه", "info");
      return;
    }
    try {
      await Promise.race([
        navigator.clipboard.writeText(barcodeValue),
        new Promise((_, reject) => {
          window.setTimeout(() => reject(new Error("clipboard-timeout")), 800);
        }),
      ]);
      toast("تم نسخ الباركود بنجاح", "success");
    } catch {
      if (copyBarcodeFallback(barcodeValue)) {
        toast("تم نسخ الباركود بنجاح", "success");
        return;
      }
      toast("تعذر نسخ الباركود", "error");
    }
  }

  async function handleLookupName() {
    const normalized = barcode.trim();
    if (!normalized) {
      toast("أدخل الباركود أولاً", "error");
      return;
    }
    setLookingUp(true);
    try {
      const res = await fetch(
        `/api/external/barcode-lookup?barcode=${encodeURIComponent(normalized)}`,
      );
      const data = (await res.json()) as {
        success?: boolean;
        translatedName?: string;
        originalName?: string;
        source?: string;
        message?: string;
      };
      const translatedName = data.translatedName?.trim() ?? "";
      const originalName = data.originalName?.trim() ?? "";
      if (!res.ok || !data.success || (!translatedName && !originalName)) {
        setFetchSource(null);
        toast(
          res.status === 404 ? "لم يتم العثور على المنتج" : (data.message ?? "تعذر جلب الاسم"),
          "error",
        );
        return;
      }
      setName(translatedName || originalName);
      setFetchedOriginalName(originalName || null);
      setFetchSource(data.source?.trim() || null);
      toast(
        data.source ? `تم جلب الاسم بنجاح من ${data.source}` : "تم جلب الاسم بنجاح",
        "success",
      );
    } catch {
      setFetchSource(null);
      toast("تعذر جلب الاسم", "error");
    } finally {
      setLookingUp(false);
    }
  }

  async function requestNameTranslation(
    text: string,
  ): Promise<{ en: string; zh: string } | null> {
    const res = await fetch("/api/admin/translate-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = (await res.json()) as {
      en?: string;
      zh?: string;
    };
    const en = data.en?.trim() ?? "";
    const zh = data.zh?.trim() ?? "";
    if (!res.ok || !en || !zh) return null;
    return { en, zh };
  }

  async function handleRetranslate() {
    const text = name.trim();
    if (!text) {
      toast("يرجى كتابة الاسم بالعربية أولاً", "error");
      return;
    }
    setRetranslating(true);
    try {
      const translated = await requestNameTranslation(text);
      if (!translated) {
        toast("تعذر تحديث الترجمة", "error");
        return;
      }
      setNameEn(translated.en);
      setNameZh(translated.zh);
      toast("تم تحديث الترجمة بنجاح", "success");
    } catch {
      toast("تعذر تحديث الترجمة", "error");
    } finally {
      setRetranslating(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    setFormError(null);

    if (!name.trim()) {
      setFormError("اسم المنتج مطلوب");
      return;
    }
    if (!Number.isFinite(regular) || regular < 0) {
      setFormError("أدخل سعراً أساسياً صالحاً");
      return;
    }
    if (saleError) {
      setFormError(saleError);
      return;
    }

    const barcodeCheck = await validateBarcode(barcode);
    if (!barcodeCheck.ok) {
      setFormError(barcodeCheck.error ?? "الباركود غير صالح أو مستخدم بالفعل");
      return;
    }

    const packageMessage = validatePackageDrafts(packages, barcode, name);
    if (packageMessage) {
      setPackageError(packageMessage);
      setFormError(packageMessage);
      return;
    }
    setPackageError(null);

    let nextNameEn = nameEn.trim();
    let nextNameZh = nameZh.trim();
    if (!nextNameEn && !nextNameZh) {
      setSavingWithTranslation(true);
      try {
        const translated = await requestNameTranslation(name.trim());
        if (!translated) {
          setFormError("تعذر ترجمة الاسم قبل الحفظ");
          setSavingWithTranslation(false);
          return;
        }
        nextNameEn = translated.en;
        nextNameZh = translated.zh;
        setNameEn(translated.en);
        setNameZh(translated.zh);
      } catch {
        setFormError("تعذر ترجمة الاسم قبل الحفظ");
        setSavingWithTranslation(false);
        return;
      }
    }

    const values: ProductFormValues = {
      name: name.trim(),
      nameEn: nextNameEn,
      nameZh: nextNameZh,
      barcode: barcode.trim(),
      price: regular,
      salePrice: sale != null && Number.isFinite(sale) && sale > 0 ? sale : null,
      categoryId: categoryId || null,
      brandId: brandId || null,
      imageUrl: imageUrl.trim(),
      isWeighed,
      isActive,
      packages: packageDraftsToPayload(packages, {
        name,
        nameEn: nextNameEn,
        nameZh: nextNameZh,
      }),
    };

    setSubmitting(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "تعذر الحفظ");
    } finally {
      setSubmitting(false);
      setSavingWithTranslation(false);
    }
  }

  return (
    <>
      <form
        dir="rtl"
        onSubmit={(event) => void handleSubmit(event)}
        className={clsx("space-y-5", className)}
      >
        <div className="space-y-1.5">
          <span className="text-sm font-medium text-slate-700">الباركود</span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1" dir="ltr">
              <Barcode className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                required={!isEdit}
                dir="ltr"
                value={barcode}
                onChange={(e) => {
                  setBarcode(e.target.value);
                  setBarcodeError(null);
                  setBarcodeVerified(false);
                  if (!e.target.value.trim()) setFetchSource(null);
                }}
                onBlur={() => {
                  if (barcode.trim()) void validateBarcode(barcode);
                }}
                disabled={busy}
                className={clsx(
                  "w-full rounded-lg border py-2.5 ps-10 pe-3 text-left font-mono text-sm outline-none focus:ring-2 disabled:bg-slate-50",
                  barcodeError
                    ? "border-red-400 focus:border-red-500 focus:ring-red-500/20"
                    : "border-slate-300 focus:border-brand-500 focus:ring-brand-500/20",
                )}
                placeholder="امسح أو اكتب أو ولّد باركوداً"
              />
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleCopyBarcode()}
                title="نسخ الباركود"
                aria-label="نسخ الباركود"
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-2.5 py-2.5 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Copy className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={busy || lookingUp}
                onClick={() => void handleLookupName()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2.5 text-sm font-semibold text-brand-800 hover:bg-brand-100 disabled:opacity-50"
              >
                جلب الاسم
                {lookingUp ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span aria-hidden>🔍</span>
                )}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setScannerOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <ScanLine className="h-4 w-4" />
                مسح
              </button>
              <button
                type="button"
                disabled={busy || generating}
                onClick={() => void handleGenerateBarcode()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Shuffle className="h-4 w-4" />
                )}
                توليد
              </button>
            </div>
          </div>
          {barcodeChecking && (
            <p className="text-xs text-slate-400">جاري التحقق من الباركود…</p>
          )}
          {barcodeError && (
            <p className="text-xs text-red-600">{barcodeError}</p>
          )}
          {barcodeVerified && !barcodeError && !barcodeChecking && (
            <p className="text-xs text-emerald-600">الباركود متاح</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="product-name" className="text-sm font-medium text-slate-700">
            اسم المنتج
          </label>
          <input
            id="product-name"
            required
            autoFocus={autoFocusName}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50"
            placeholder="مثال: زيت زيتون 1 لتر"
          />
          <button
            type="button"
            onClick={() => void handleRetranslate()}
            disabled={busy || retranslating}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-base font-semibold text-brand-800 hover:bg-brand-100 disabled:opacity-50"
          >
            {retranslating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <span aria-hidden>🌐</span>
            )}
            ترجمة للإنجليزية والصينية
          </button>
          {(fetchSource ||
            (fetchedOriginalName && fetchedOriginalName !== name.trim())) && (
            <div className="flex flex-wrap items-center gap-2">
              {fetchedOriginalName && fetchedOriginalName !== name.trim() && (
                <button
                  type="button"
                  onClick={() => {
                    setName(fetchedOriginalName);
                    setFetchedOriginalName(null);
                  }}
                  className="text-start text-xs font-medium text-brand-700 hover:underline"
                >
                  الترجمة غير دقيقة؟ استخدام الاسم الأصلي: {fetchedOriginalName}
                </button>
              )}
              {fetchSource && (
                <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-500">
                  مصدر البيانات: {fetchSource}
                </span>
              )}
            </div>
          )}
        </div>

        {retranslating && (
          <p className="text-xs text-slate-500">جاري الترجمة…</p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">
              الاسم بالإنجليزية
            </span>
            <div className="relative" dir="ltr">
              <Globe className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                dir="ltr"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                disabled={retranslating || busy}
                className="w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-3 text-left text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50"
              />
            </div>
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">
              الاسم بالصينية
            </span>
            <input
              dir="ltr"
              value={nameZh}
              onChange={(e) => setNameZh(e.target.value)}
              disabled={retranslating || busy}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-left text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50"
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">التصنيف</span>
            <CategorySelect value={categoryId} onChange={setCategoryId} />
          </div>
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">
              العلامة التجارية
            </span>
            <BrandSelect value={brandId} onChange={setBrandId} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">
              السعر الأساسي
            </span>
            <div className="flex overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
              <input
                required
                type="number"
                min={0}
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                disabled={busy}
                className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 text-sm outline-none disabled:bg-slate-50"
              />
              <span className="inline-flex items-center border-s border-brand-100 bg-brand-50 px-3 text-sm font-semibold text-brand-800">
                ج.م
              </span>
            </div>
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">
              سعر التخفيض
            </span>
            <div
              className={clsx(
                "flex overflow-hidden rounded-lg border bg-white focus-within:ring-2",
                saleError
                  ? "border-red-400 focus-within:border-red-500 focus-within:ring-red-500/20"
                  : "border-slate-300 focus-within:border-brand-500 focus-within:ring-brand-500/20",
              )}
            >
              <input
                type="number"
                min={0}
                step="0.01"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                disabled={busy}
                placeholder="اختياري، أقل من السعر الأساسي"
                className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 text-sm outline-none disabled:bg-slate-50"
              />
              <span className="inline-flex items-center border-s border-brand-100 bg-brand-50 px-3 text-sm font-semibold text-brand-800">
                ج.م
              </span>
            </div>
            {saleError && (
              <span className="text-xs text-red-600">{saleError}</span>
            )}
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
            سعر التكلفة
            <input
              type="number"
              min={0}
              step="0.01"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              disabled={busy}
              placeholder="0"
              aria-label="سعر التكلفة"
              className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none focus:border-brand-500 disabled:bg-slate-50"
            />
          </label>
          <MarginPills
            cost={Number(costPrice)}
            disabled={busy}
            onSelect={applyMargin}
          />
        </div>

        <div className="my-4 grid grid-cols-1 items-start gap-4 md:grid-cols-2">
          <FieldToggle
            checked={isWeighed}
            onChange={setIsWeighed}
            disabled={busy}
            label="يُباع بالوزن"
            description="باركود الميزان يحتوي على السعر الإجمالي. تقسم نقطة البيع هذا السعر على سعر الوحدة لاستخراج الوزن بالكيلوجرام."
          />
          <FieldToggle
            checked={isActive}
            onChange={setIsActive}
            disabled={busy}
            label="حالة العرض"
            status={isActive ? "مفعل" : "غير مفعل"}
            description="المنتج المخفي يبقى في نقطة البيع والمخزون، ولا يظهر في الموقع والتطبيق."
          />
        </div>

        {showPackagePriceWarning && (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-2.5">
              <TriangleAlert
                className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
                aria-hidden
              />
              <p className="text-sm font-medium leading-6">
                ⚠️ تنبيه: لقد قمت بتعديل السعر الأساسي للمنتج. يرجى مراجعة أسعار
                العبوات المخصصة، حيث أنها قد تحتوي على تسعير قديم.
              </p>
            </div>
            <button
              type="button"
              onClick={resetPackagePrices}
              disabled={busy}
              className="inline-flex shrink-0 items-center justify-center rounded-lg bg-amber-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
            >
              إعادة تعيين أسعار العبوات
            </button>
          </div>
        )}

        <ProductPackagesFields
          packages={packages}
          productName={name}
          productNameEn={nameEn}
          productNameZh={nameZh}
          onChange={(next) => {
            setPackages(next);
            setPackageError(null);
          }}
        />
        {packageError && <p className="text-xs text-red-600">{packageError}</p>}
        {formError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {formError}
          </p>
        )}

        <div className="space-y-1.5">
          <span className="text-sm font-medium text-slate-700">رفع صورة</span>
          <ImagePicker
            value={imageUrl}
            productName={name}
            productId={initialData?.id}
            onChange={setImageUrl}
          />
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          {cancelHref ? (
            <Link
              href={cancelHref}
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              إلغاء
            </Link>
          ) : (
            onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                إلغاء
              </button>
            )
          )}
          <button
            type="submit"
            disabled={busy || Boolean(saleError) || Boolean(barcodeError)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {savingWithTranslation
              ? "جاري الترجمة والحفظ..."
              : busy
                ? isEdit
                  ? "جاري الحفظ…"
                  : "جاري الإنشاء…"
                : (submitLabel ?? (isEdit ? "حفظ" : "إنشاء المنتج"))}
          </button>
        </div>
      </form>

      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(value) => {
          setBarcode(value);
          setBarcodeError(null);
          void validateBarcode(value);
        }}
      />
    </>
  );
}

export function ProductForm(
  props: React.ComponentProps<typeof ProductFormFields>,
) {
  return (
    <ToastProvider>
      <ProductFormFields {...props} />
    </ToastProvider>
  );
}
