"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { AdminProductRow } from "@/types/adminProduct";
import { VirtualBundleLinkFields } from "@/components/dashboard/VirtualBundleLinkFields";
import { CategorySelect } from "@/components/dashboard/CategorySelect";
import { BrandSelect } from "@/components/dashboard/BrandSelect";
import { useArabicNameTranslation } from "@/components/dashboard/useArabicNameTranslation";
import { ImagePicker } from "@/components/ui/ImagePicker";

interface ProductEditModalProps {
  product: AdminProductRow;
  open: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: (values: {
    name: string;
    sku: string;
    barcode: string;
    price: number;
    salePrice: number | null;
    linkedProductId: string | null;
    bundleMultiplier: number | null;
    categoryId: string | null;
    brandId: string | null;
    imageUrl: string;
    nameEn: string;
    nameZh: string;
  }) => Promise<void>;
}

export function ProductEditModal({
  product,
  open,
  isSaving,
  onClose,
  onSave,
}: ProductEditModalProps) {
  const [name, setName] = useState(product.name);
  const [nameEn, setNameEn] = useState(product.nameEn ?? "");
  const [nameZh, setNameZh] = useState(product.nameZh ?? "");
  const { translating, onArabicNameBlur } = useArabicNameTranslation(
    nameEn,
    nameZh,
    setNameEn,
    setNameZh,
  );
  const [sku, setSku] = useState(product.sku ?? "");
  const [barcode, setBarcode] = useState(product.barcode ?? "");
  const [price, setPrice] = useState(String(product.price ?? ""));
  const [salePrice, setSalePrice] = useState(
    product.salePrice != null && product.salePrice > 0
      ? String(product.salePrice)
      : "",
  );
  const [priceError, setPriceError] = useState<string | null>(null);
  const [isBundle, setIsBundle] = useState(Boolean(product.linkedProductId));
  const [linkedProductId, setLinkedProductId] = useState(
    product.linkedProductId ?? "",
  );
  const [bundleMultiplier, setBundleMultiplier] = useState(
    String(product.bundleMultiplier ?? 3),
  );
  const [categoryId, setCategoryId] = useState(product.categoryId ?? "");
  const [brandId, setBrandId] = useState(product.brandId ?? "");
  const [imageUrl, setImageUrl] = useState(product.imageUrl ?? "");

  useEffect(() => {
    if (!open) return;
    setName(product.name);
    setNameEn(product.nameEn ?? "");
    setNameZh(product.nameZh ?? "");
    setSku(product.sku ?? "");
    setBarcode(product.barcode ?? "");
    setPrice(String(product.price ?? ""));
    setSalePrice(
      product.salePrice != null && product.salePrice > 0
        ? String(product.salePrice)
        : "",
    );
    setPriceError(null);
    setIsBundle(Boolean(product.linkedProductId));
    setLinkedProductId(product.linkedProductId ?? "");
    setBundleMultiplier(String(product.bundleMultiplier ?? 3));
    setCategoryId(product.categoryId ?? "");
    setBrandId(product.brandId ?? "");
    setImageUrl(product.imageUrl ?? "");
    // Only re-seed when the modal opens for a given product — not on every
    // parent re-render with a new `product` object reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [open, product.id]);

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
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              تعديل المنتج
            </h2>
            <p className="text-xs text-slate-400">WC #{product.wcId}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          className="max-h-[min(80dvh,720px)] space-y-4 overflow-y-auto px-5 py-5"
          onSubmit={(e) => {
            e.preventDefault();
            const regular = parseFloat(price);
            const saleRaw = salePrice.trim();
            const sale = saleRaw === "" ? null : parseFloat(saleRaw);
            if (!Number.isFinite(regular) || regular < 0) {
              setPriceError("Enter a valid regular price");
              return;
            }
            if (sale != null && (!Number.isFinite(sale) || sale < 0)) {
              setPriceError("Enter a valid sale price");
              return;
            }
            if (sale != null && sale > 0 && sale >= regular) {
              setPriceError("Sale price must be less than the regular price");
              return;
            }
            setPriceError(null);
            const normalizedSale = sale != null && sale > 0 ? sale : null;
            const prices = { price: regular, salePrice: normalizedSale };
            if (isBundle) {
              if (!linkedProductId) return;
              const mult = Math.floor(Number(bundleMultiplier));
              if (!Number.isFinite(mult) || mult < 1) return;
              void onSave({
                name,
                sku,
                barcode,
                ...prices,
                linkedProductId,
                bundleMultiplier: mult,
                categoryId: categoryId || null,
                brandId: brandId || null,
                imageUrl,
                nameEn,
                nameZh,
              });
              return;
            }
            void onSave({
              name,
              sku,
              barcode,
              ...prices,
              linkedProductId: null,
              bundleMultiplier: null,
              categoryId: categoryId || null,
              brandId: brandId || null,
              imageUrl,
              nameEn,
              nameZh,
            });
          }}
        >
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Image</span>
            <ImagePicker
              value={imageUrl}
              productName={name}
              productId={product.id}
              onChange={setImageUrl}
            />
          </div>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Name</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => void onArabicNameBlur(name)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
          {translating && (
            <p className="text-xs text-slate-500">جاري الترجمة... ⏳</p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">
                الاسم (English)
              </span>
              <input
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                disabled={translating}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">
                الاسم (中文)
              </span>
              <input
                value={nameZh}
                onChange={(e) => setNameZh(e.target.value)}
                disabled={translating}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50"
              />
            </label>
          </div>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Category</span>
            <CategorySelect value={categoryId} onChange={setCategoryId} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">
              العلامة التجارية
            </span>
            <BrandSelect value={brandId} onChange={setBrandId} />
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
                onChange={(e) => {
                  setPrice(e.target.value);
                  setPriceError(null);
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
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
                onChange={(e) => {
                  setSalePrice(e.target.value);
                  setPriceError(null);
                }}
                placeholder="Must be less than regular"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </label>
          </div>
          {priceError && <p className="text-xs text-red-600">{priceError}</p>}
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Barcode</span>
            <input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              placeholder="_op_barcode"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">SKU</span>
            <input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>

          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
            <div className="flex items-start gap-3">
              <input
                id="edit-product-is-bundle"
                type="checkbox"
                checked={isBundle}
                onChange={(e) => setIsBundle(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <label
                htmlFor="edit-product-is-bundle"
                className="cursor-pointer select-none"
              >
                <span className="block text-sm font-semibold text-slate-800">
                  Is this a Bundle/Pack? (Virtual Product)
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  Inventory is tracked only on the linked single unit.
                </span>
              </label>
            </div>

            {isBundle ? (
              <VirtualBundleLinkFields
                linkedProductId={linkedProductId}
                onLinkedProductIdChange={setLinkedProductId}
                bundleMultiplier={bundleMultiplier}
                onBundleMultiplierChange={setBundleMultiplier}
                excludeProductId={product.id}
              />
            ) : (
              <p className="text-xs text-gray-500">
                Current stock:{" "}
                <strong className="tabular-nums text-slate-800">
                  {product.stockQuantity}
                </strong>
                . الرصيد للعرض فقط. لتعديل الرصيد، يرجى استخدام (أرصدة أول المدة) أو (فواتير المشتريات) للحفاظ على دقة كارت الصنف.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={
                isSaving ||
                !name.trim() ||
                (isBundle &&
                  (!linkedProductId ||
                    !Number.isFinite(Math.floor(Number(bundleMultiplier))) ||
                    Math.floor(Number(bundleMultiplier)) < 1))
              }
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {isSaving ? "جاري الحفظ…" : "حفظ"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
