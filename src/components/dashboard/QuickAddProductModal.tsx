"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { VirtualBundleLinkFields } from "@/components/dashboard/VirtualBundleLinkFields";

export interface QuickAddedProduct {
  id: string;
  wcId: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  stockQuantity: number;
  price: number;
  salePrice: number | null;
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
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [isVirtual, setIsVirtual] = useState(false);
  const [linkedProductId, setLinkedProductId] = useState("");
  const [bundleMultiplier, setBundleMultiplier] = useState("3");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const query = searchQuery.trim();
    if (isNumericQuery(query)) {
      setBarcode(query);
      setName("");
    } else {
      setBarcode("");
      setName(query);
    }
    setIsVirtual(false);
    setLinkedProductId("");
    setBundleMultiplier("3");
    setError(null);
    setSubmitting(false);
  }, [open, searchQuery]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setError(null);

    if (!name.trim()) {
      setError("Product name is required");
      return;
    }
    if (!barcode.trim()) {
      setError("Barcode is required");
      return;
    }
    if (isVirtual) {
      if (!linkedProductId) {
        setError("Select the parent product for this carton");
        return;
      }
      const mult = Math.floor(Number(bundleMultiplier));
      if (!Number.isFinite(mult) || mult < 1) {
        setError("Conversion rate must be at least 1 piece");
        return;
      }
    }

    setSubmitting(true);
    try {
      const form = new FormData();
      form.set("name", name.trim());
      form.set("barcode", barcode.trim());
      // Prices are set later with the invoice line's inline editors.
      form.set("price", "0");
      form.set("stockQuantity", "0");
      form.set("stockStatus", "instock");
      if (isVirtual) {
        form.set("linkedProductId", linkedProductId);
        form.set(
          "bundleMultiplier",
          String(Math.floor(Number(bundleMultiplier))),
        );
      }

      const res = await fetch("/api/products/create", {
        method: "POST",
        body: form,
      });
      const body = (await res.json()) as {
        error?: string;
        product?: QuickAddedProduct;
      };
      if (!res.ok || !body.product) {
        throw new Error(body.error ?? "Could not create product");
      }
      onCreated(body.product);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create product");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="flex max-h-[min(92dvh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Add new product
            </h2>
            <p className="text-sm text-slate-500">
              Created on the ERP and WooCommerce, then added to this invoice.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Product name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Barcode
            </span>
            <input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              required
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>

          <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
            <input
              type="checkbox"
              checked={isVirtual}
              onChange={(e) => setIsVirtual(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Is virtual product / carton?
          </label>

          {isVirtual && (
            <VirtualBundleLinkFields
              linkedProductId={linkedProductId}
              onLinkedProductIdChange={setLinkedProductId}
              bundleMultiplier={bundleMultiplier}
              onBundleMultiplierChange={setBundleMultiplier}
              parentLabel="Parent product"
              multiplierLabel="Conversion rate (piece count)"
            />
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:bg-slate-300"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? "Creating…" : "Create product"}
          </button>
        </div>
      </form>
    </div>
  );
}
