"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { AdminProductRow } from "@/types/adminProduct";

interface BaseProductOption {
  id: string;
  name: string;
  barcode: string | null;
  stockQuantity: number;
  linkedProductId: string | null;
}

interface ProductEditModalProps {
  product: AdminProductRow;
  open: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: (values: {
    name: string;
    sku: string;
    barcode: string;
    linkedProductId: string | null;
    bundleMultiplier: number | null;
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
  const [sku, setSku] = useState(product.sku ?? "");
  const [barcode, setBarcode] = useState(product.barcode ?? "");
  const [isBundle, setIsBundle] = useState(Boolean(product.linkedProductId));
  const [linkedProductId, setLinkedProductId] = useState(
    product.linkedProductId ?? "",
  );
  const [bundleMultiplier, setBundleMultiplier] = useState(
    String(product.bundleMultiplier ?? 3),
  );
  const [baseProducts, setBaseProducts] = useState<BaseProductOption[]>([]);

  useEffect(() => {
    if (!open) return;
    setName(product.name);
    setSku(product.sku ?? "");
    setBarcode(product.barcode ?? "");
    setIsBundle(Boolean(product.linkedProductId));
    setLinkedProductId(product.linkedProductId ?? "");
    setBundleMultiplier(String(product.bundleMultiplier ?? 3));
  }, [open, product]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const res = await fetch("/api/products?page=1&perPage=500");
        if (!res.ok) return;
        const body = (await res.json()) as { products?: BaseProductOption[] };
        setBaseProducts(
          (body.products ?? []).filter(
            (p) => !p.linkedProductId && p.id !== product.id,
          ),
        );
      } catch {
        // ignore
      }
    })();
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
            <h2 className="text-lg font-semibold text-slate-900">Edit product</h2>
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
          className="space-y-4 px-5 py-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (isBundle) {
              if (!linkedProductId) return;
              const mult = Math.floor(Number(bundleMultiplier));
              if (!Number.isFinite(mult) || mult < 1) return;
              void onSave({
                name,
                sku,
                barcode,
                linkedProductId,
                bundleMultiplier: mult,
              });
              return;
            }
            void onSave({
              name,
              sku,
              barcode,
              linkedProductId: null,
              bundleMultiplier: null,
            });
          }}
        >
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Name</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
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

          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 space-y-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={isBundle}
                onChange={(e) => setIsBundle(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-800">
                  Is this a Bundle/Pack? (Virtual Product)
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  Inventory is tracked only on the linked single unit.
                </span>
              </span>
            </label>

            {isBundle ? (
              <div className="space-y-3">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">
                    Linked base product
                  </span>
                  <select
                    required
                    value={linkedProductId}
                    onChange={(e) => setLinkedProductId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  >
                    <option value="">Select base product…</option>
                    {baseProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.barcode ? ` · ${p.barcode}` : ""} · stock{" "}
                        {p.stockQuantity}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">
                    Bundle multiplier
                  </span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    required
                    value={bundleMultiplier}
                    onChange={(e) => setBundleMultiplier(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  />
                </label>
                <p className="text-xs text-amber-800">
                  Stock fields are not edited here — this pack has no own
                  inventory.
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Current stock:{" "}
                <strong className="tabular-nums text-slate-800">
                  {product.stockQuantity}
                </strong>{" "}
                (edit stock from the products grid)
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
              Cancel
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
              {isSaving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
