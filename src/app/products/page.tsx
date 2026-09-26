"use client";

import { Package, RefreshCw } from "lucide-react";
import { useCatalogSync } from "@/hooks/useCatalogSync";
import { getOpBarcodes } from "@/lib/pos/opBarcode";
import { formatEGP, parsePrice } from "@/lib/pos/money";

export default function ProductsPage() {
  const {
    products,
    productCount,
    isLoading,
    isRefreshing,
    refreshCatalog,
    error,
  } = useCatalogSync();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Products</h1>
          <p className="mt-1 text-slate-500">
            {productCount} products from local ERP database
          </p>
        </div>
        <button
          type="button"
          onClick={() => refreshCatalog()}
          disabled={isRefreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw
            className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-slate-400">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading from local database…
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <Package className="mx-auto h-12 w-12 text-slate-300" />
          <p className="mt-4 text-slate-600">No products in local database</p>
          <p className="mt-1 text-sm text-slate-400">
            Create products from the ERP dashboard.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-3 font-medium text-slate-600">Name</th>
                <th className="px-4 py-3 font-medium text-slate-600">Barcode</th>
                <th className="px-4 py-3 font-medium text-slate-600">SKU</th>
                <th className="px-4 py-3 font-medium text-slate-600">Price</th>
                <th className="px-4 py-3 font-medium text-slate-600">Stock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((product) => (
                <tr key={product.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{product.name}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {getOpBarcodes(product)[0] || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {product.sku || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {formatEGP(parsePrice(product.price))}
                  </td>
                  <td className="px-4 py-3">{product.stock_quantity ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
