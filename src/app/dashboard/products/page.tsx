"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Package,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { CatalogSyncButton } from "@/components/dashboard/CatalogSyncButton";
import { PermanentDeleteDialog } from "@/components/dashboard/PermanentDeleteDialog";
import { ProductEditModal } from "@/components/dashboard/ProductEditModal";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import {
  downloadProductsExcel,
  parseProductsExcel,
} from "@/lib/products/excel";
import type { AdminProductRow } from "@/types/adminProduct";
import { clsx } from "clsx";

const PER_PAGE = 20;

interface ProductsResponse {
  products: AdminProductRow[];
  total: number;
  page: number;
  perPage: number;
  pageCount: number;
  error?: string;
}

type ViewMode = "active" | "trash";
type StockFilter = "all" | "instock" | "outofstock";

export default function DashboardProductsPage() {
  return (
    <ToastProvider>
      <ProductsManagement />
    </ToastProvider>
  );
}

function ProductsManagement() {
  const { toast } = useToast();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [products, setProducts] = useState<AdminProductRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("active");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editProduct, setEditProduct] = useState<AdminProductRow | null>(null);
  const [isEditSaving, setIsEditSaving] = useState(false);
  const [deleteProduct, setDeleteProduct] = useState<AdminProductRow | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState("Working…");

  const loadProducts = useCallback(
    async (
      pageNum: number,
      q: string,
      mode: ViewMode,
      stock: StockFilter = "all",
    ) => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: String(pageNum),
          perPage: String(PER_PAGE),
        });
        if (q) params.set("q", q);
        if (mode === "trash") params.set("trash", "1");
        if (stock === "instock" || stock === "outofstock") {
          params.set("stockStatus", stock);
        }

        const res = await fetch(`/api/products?${params.toString()}`);
        const data = (await res.json()) as ProductsResponse;
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to load products");
        }

        setProducts(data.products ?? []);
        setTotal(data.total ?? 0);
        setPage(data.page ?? pageNum);
        setPageCount(data.pageCount ?? 1);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load products",
        );
        setProducts([]);
        setTotal(0);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadProducts(page, query, view, stockFilter);
  }, [loadProducts, page, query, view, stockFilter]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next = searchInput.trim();
    startTransition(() => {
      setPage(1);
      setQuery(next);
    });
  }

  function handleClearSearch() {
    setSearchInput("");
    startTransition(() => {
      setPage(1);
      setQuery("");
    });
  }

  function switchView(mode: ViewMode) {
    startTransition(() => {
      setView(mode);
      setPage(1);
    });
  }

  function changeStockFilter(next: StockFilter) {
    startTransition(() => {
      setStockFilter(next);
      setPage(1);
    });
  }

  function refreshAfterSync() {
    startTransition(() => {
      setPage(1);
      void loadProducts(1, query, view, stockFilter);
    });
  }

  async function fetchAllActiveProducts(): Promise<AdminProductRow[]> {
    const params = new URLSearchParams({
      page: "1",
      perPage: "10000",
    });
    const res = await fetch(`/api/products?${params.toString()}`);
    const data = (await res.json()) as ProductsResponse;
    if (!res.ok) {
      throw new Error(data.error ?? "Failed to load products for export");
    }
    return data.products ?? [];
  }

  async function handleExportExcel() {
    setBulkBusy(true);
    setBulkMessage("Preparing Excel export…");
    try {
      const all = await fetchAllActiveProducts();
      downloadProductsExcel(all);
      toast(`Exported ${all.length} products`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Export failed", "error");
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleImportExcel(file: File) {
    setBulkBusy(true);
    setBulkMessage("Parsing Excel…");
    try {
      const buffer = await file.arrayBuffer();
      const rows = parseProductsExcel(buffer);
      if (rows.length === 0) {
        throw new Error("No rows found in Excel file");
      }

      setBulkMessage(
        `Updating ${rows.length} products on ERP & WooCommerce…`,
      );
      const res = await fetch("/api/products/bulk-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products: rows }),
      });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        updated?: number;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Bulk update failed");
      }

      toast(
        data.message ?? `Updated ${data.updated ?? rows.length} products`,
        "success",
      );
      await loadProducts(1, query, view, stockFilter);
      setPage(1);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Import failed", "error");
    } finally {
      setBulkBusy(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  function patchLocal(id: string, patch: Partial<AdminProductRow>) {
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );
  }

  async function patchProduct(
    id: string,
    body: Record<string, unknown>,
    successMessage: string,
  ) {
    setSavingId(id);
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        error?: string;
        product?: AdminProductRow;
      };
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      if (data.product) {
        if (view === "active" && data.product.isDeleted) {
          setProducts((prev) => prev.filter((p) => p.id !== id));
          setTotal((t) => Math.max(0, t - 1));
        } else if (view === "trash" && !data.product.isDeleted) {
          setProducts((prev) => prev.filter((p) => p.id !== id));
          setTotal((t) => Math.max(0, t - 1));
        } else {
          patchLocal(id, data.product);
        }
      }
      toast(successMessage, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Update failed", "error");
      await loadProducts(page, query, view, stockFilter);
    } finally {
      setSavingId(null);
    }
  }

  async function savePrice(product: AdminProductRow, raw: string) {
    const price = parseFloat(raw);
    if (!Number.isFinite(price) || price < 0) {
      toast("Enter a valid price", "error");
      return;
    }
    if (
      product.salePrice != null &&
      product.salePrice > 0 &&
      price < product.salePrice
    ) {
      toast("Sale price cannot be greater than the regular price", "error");
      return;
    }
    if (price === product.price) return;
    await patchProduct(product.id, { price }, "Price updated on ERP & WooCommerce");
  }

  async function saveSalePrice(product: AdminProductRow, raw: string) {
    const trimmed = raw.trim();
    if (trimmed === "") {
      if (product.salePrice == null) return;
      await patchProduct(
        product.id,
        { salePrice: null },
        "Sale price cleared on ERP & WooCommerce",
      );
      return;
    }
    const salePrice = parseFloat(trimmed);
    if (!Number.isFinite(salePrice) || salePrice < 0) {
      toast("Enter a valid sale price", "error");
      return;
    }
    if (salePrice > product.price) {
      toast("Sale price cannot be greater than the regular price", "error");
      return;
    }
    const normalized = salePrice > 0 ? salePrice : null;
    if (normalized === product.salePrice) return;
    if (normalized == null && product.salePrice == null) return;
    await patchProduct(
      product.id,
      { salePrice: normalized },
      "Sale price updated on ERP & WooCommerce",
    );
  }

  async function saveStockQty(product: AdminProductRow, raw: string) {
    const qty = parseInt(raw, 10);
    if (!Number.isFinite(qty) || qty < 0) {
      toast("Enter a valid stock quantity", "error");
      return;
    }
    if (qty === product.stockQuantity) return;
    await patchProduct(
      product.id,
      { stockQuantity: qty },
      "Stock quantity updated on ERP & WooCommerce",
    );
  }

  async function toggleStock(product: AdminProductRow) {
    const stockStatus =
      product.stockStatus === "instock" ? "outofstock" : "instock";
    await patchProduct(
      product.id,
      { stockStatus },
      stockStatus === "instock"
        ? "Marked In Stock (synced)"
        : "Marked Out of Stock (synced)",
    );
  }

  async function softDelete(product: AdminProductRow) {
    await patchProduct(product.id, { isDeleted: true }, "Moved to Trash");
  }

  async function toggleFavorite(product: AdminProductRow) {
    await patchProduct(
      product.id,
      { isFavorite: !product.isFavorite },
      product.isFavorite ? "Removed from favorites" : "Added to favorites",
    );
  }

  async function restore(product: AdminProductRow) {
    await patchProduct(product.id, { isDeleted: false }, "Restored from Trash");
  }

  async function saveEdit(values: {
    name: string;
    sku: string;
    barcode: string;
  }) {
    if (!editProduct) return;
    setIsEditSaving(true);
    try {
      const res = await fetch(`/api/products/${editProduct.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          sku: values.sku || null,
          barcode: values.barcode || null,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        product?: AdminProductRow;
      };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      if (data.product) patchLocal(editProduct.id, data.product);
      toast("Product details saved & synced", "success");
      setEditProduct(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setIsEditSaving(false);
    }
  }

  async function permanentDelete(scope: "erp" | "both") {
    if (!deleteProduct) return;
    setIsDeleting(true);
    try {
      const res = await fetch(
        `/api/products/${deleteProduct.id}?scope=${scope}`,
        { method: "DELETE" },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      setProducts((prev) => prev.filter((p) => p.id !== deleteProduct.id));
      setTotal((t) => Math.max(0, t - 1));
      toast(
        scope === "both"
          ? "Deleted from ERP & WooCommerce"
          : "Deleted from ERP only",
        "success",
      );
      setDeleteProduct(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed", "error");
    } finally {
      setIsDeleting(false);
    }
  }

  const from = total === 0 ? 0 : (page - 1) * PER_PAGE + 1;
  const to = Math.min(page * PER_PAGE, total);
  const colSpan = 10;

  return (
    <div className="relative space-y-6">
      {bulkBusy && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px]">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-6 py-4 shadow-xl">
            <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
            <p className="text-sm font-semibold text-slate-800">{bulkMessage}</p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Products Management
          </h1>
          <p className="mt-1 text-slate-500">
            Local ERP catalog with live WooCommerce sync
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          {view === "active" && (
            <>
              <Link
                href="/dashboard/products/new"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" />
                Create New Product
              </Link>
              <CatalogSyncButton variant="page" onSuccess={refreshAfterSync} />
            </>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 pt-4">
          <button
            type="button"
            onClick={() => switchView("active")}
            className={clsx(
              "rounded-t-lg border border-b-0 px-4 py-2 text-sm font-semibold",
              view === "active"
                ? "border-slate-200 bg-white text-slate-900"
                : "border-transparent bg-slate-50 text-slate-500 hover:text-slate-800",
            )}
          >
            Products
          </button>
          <button
            type="button"
            onClick={() => switchView("trash")}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-t-lg border border-b-0 px-4 py-2 text-sm font-semibold",
              view === "trash"
                ? "border-slate-200 bg-white text-red-700"
                : "border-transparent bg-slate-50 text-slate-500 hover:text-slate-800",
            )}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Trash
          </button>
        </div>

        <div className="flex flex-col gap-3 border-b border-slate-200 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <form
              onSubmit={handleSearchSubmit}
              className="flex flex-1 flex-col gap-2 sm:max-w-md sm:flex-row"
            >
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search by name or barcode…"
                  className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Search
                </button>
                {query && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    Clear
                  </button>
                )}
              </div>
            </form>

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <span className="whitespace-nowrap font-medium">Stock</span>
                <select
                  value={stockFilter}
                  onChange={(e) =>
                    changeStockFilter(e.target.value as StockFilter)
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                >
                  <option value="all">All</option>
                  <option value="instock">In Stock</option>
                  <option value="outofstock">Out of Stock</option>
                </select>
              </label>

              {view === "active" && (
                <>
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() => void handleExportExcel()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" />
                    Export to Excel
                  </button>
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() => importInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Upload className="h-4 w-4" />
                    Import Excel
                  </button>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleImportExcel(file);
                    }}
                  />
                </>
              )}
            </div>
          </div>
          <p className="text-sm text-slate-500">
            {isLoading || isPending
              ? "Loading…"
              : `${total.toLocaleString()} ${view === "trash" ? "in trash" : `product${total === 1 ? "" : "s"}`}`}
            {stockFilter !== "all" ? (
              <span className="text-slate-400">
                {" "}
                · {stockFilter === "instock" ? "In Stock" : "Out of Stock"}
              </span>
            ) : null}
          </p>
        </div>

        {error && (
          <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">★</th>
                <th className="px-4 py-3 font-semibold">Image</th>
                <th className="px-4 py-3 font-semibold">Product Name</th>
                <th className="px-4 py-3 font-semibold">Barcode</th>
                <th className="px-4 py-3 font-semibold">SKU</th>
                <th className="px-4 py-3 font-semibold">Price (EGP)</th>
                <th className="px-4 py-3 font-semibold">Sale Price</th>
                <th className="px-4 py-3 font-semibold">Stock Status</th>
                <th className="px-4 py-3 font-semibold">Stock Qty</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && products.length === 0 ? (
                <tr>
                  <td
                    colSpan={colSpan}
                    className="px-4 py-16 text-center text-slate-400"
                  >
                    Loading products…
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-16 text-center">
                    <Package className="mx-auto h-10 w-10 text-slate-300" />
                    <p className="mt-3 font-medium text-slate-600">
                      {view === "trash" ? "Trash is empty" : "No products found"}
                    </p>
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <ProductRow
                    key={product.id}
                    product={product}
                    view={view}
                    busy={savingId === product.id}
                    onSavePrice={savePrice}
                    onSaveSalePrice={saveSalePrice}
                    onSaveStockQty={saveStockQty}
                    onToggleStock={toggleStock}
                    onToggleFavorite={() => void toggleFavorite(product)}
                    onEdit={() => setEditProduct(product)}
                    onSoftDelete={() => void softDelete(product)}
                    onRestore={() => void restore(product)}
                    onPermanentDelete={() => setDeleteProduct(product)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            {total === 0
              ? "No results"
              : `Showing ${from}–${to} of ${total.toLocaleString()}`}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </button>
            <span className="min-w-[5.5rem] text-center text-sm tabular-nums text-slate-600">
              Page {page} / {pageCount}
            </span>
            <button
              type="button"
              disabled={page >= pageCount || isLoading}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {editProduct && (
        <ProductEditModal
          product={editProduct}
          open={!!editProduct}
          isSaving={isEditSaving}
          onClose={() => !isEditSaving && setEditProduct(null)}
          onSave={saveEdit}
        />
      )}

      {deleteProduct && (
        <PermanentDeleteDialog
          product={deleteProduct}
          open={!!deleteProduct}
          isDeleting={isDeleting}
          onClose={() => !isDeleting && setDeleteProduct(null)}
          onDeleteErpOnly={() => void permanentDelete("erp")}
          onDeleteBoth={() => void permanentDelete("both")}
        />
      )}
    </div>
  );
}

function ProductRow({
  product,
  view,
  busy,
  onSavePrice,
  onSaveSalePrice,
  onSaveStockQty,
  onToggleStock,
  onToggleFavorite,
  onEdit,
  onSoftDelete,
  onRestore,
  onPermanentDelete,
}: {
  product: AdminProductRow;
  view: ViewMode;
  busy: boolean;
  onSavePrice: (product: AdminProductRow, raw: string) => Promise<void>;
  onSaveSalePrice: (product: AdminProductRow, raw: string) => Promise<void>;
  onSaveStockQty: (product: AdminProductRow, raw: string) => Promise<void>;
  onToggleStock: (product: AdminProductRow) => Promise<void>;
  onToggleFavorite: () => void;
  onEdit: () => void;
  onSoftDelete: () => void;
  onRestore: () => void;
  onPermanentDelete: () => void;
}) {
  const [priceDraft, setPriceDraft] = useState(String(product.price));
  const [saleDraft, setSaleDraft] = useState(
    product.salePrice != null ? String(product.salePrice) : "",
  );
  const [qtyDraft, setQtyDraft] = useState(String(product.stockQuantity));
  const inStock = product.stockStatus !== "outofstock";

  useEffect(() => {
    setPriceDraft(String(product.price));
  }, [product.price]);

  useEffect(() => {
    setSaleDraft(product.salePrice != null ? String(product.salePrice) : "");
  }, [product.salePrice]);

  useEffect(() => {
    setQtyDraft(String(product.stockQuantity));
  }, [product.stockQuantity]);

  return (
    <tr className={clsx("hover:bg-slate-50/80", busy && "opacity-60")}>
      <td className="px-3 py-3">
        <button
          type="button"
          disabled={busy || view === "trash"}
          onClick={onToggleFavorite}
          className="rounded-lg p-1.5 hover:bg-amber-50 disabled:opacity-40"
          title={product.isFavorite ? "Unfavorite" : "Favorite"}
          aria-label="Toggle favorite"
        >
          <Star
            className={clsx(
              "h-5 w-5",
              product.isFavorite
                ? "fill-amber-400 text-amber-500"
                : "text-slate-300",
            )}
          />
        </button>
      </td>
      <td className="px-4 py-3">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt=""
            className="h-12 w-12 rounded-lg border border-slate-200 object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-slate-300">
            <Package className="h-5 w-5" />
          </div>
        )}
      </td>
      <td className="max-w-xs px-4 py-3">
        <p className="line-clamp-2 font-medium text-slate-900">{product.name}</p>
        <p className="mt-0.5 text-xs text-slate-400">WC #{product.wcId}</p>
      </td>
      <td className="px-4 py-3 font-mono text-xs text-slate-600">
        {product.barcode || "—"}
      </td>
      <td className="px-4 py-3 text-slate-600">{product.sku || "—"}</td>
      <td className="px-4 py-3">
        {view === "active" ? (
          <input
            type="number"
            min={0}
            step="0.01"
            disabled={busy}
            value={priceDraft}
            onChange={(e) => setPriceDraft(e.target.value)}
            onBlur={() => void onSavePrice(product, priceDraft)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm font-medium tabular-nums outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        ) : (
          <span className="font-medium tabular-nums text-slate-700">
            {product.price.toFixed(2)}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        {view === "active" ? (
          <input
            type="number"
            min={0}
            step="0.01"
            disabled={busy}
            value={saleDraft}
            placeholder="—"
            onChange={(e) => setSaleDraft(e.target.value)}
            onBlur={() => void onSaveSalePrice(product, saleDraft)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="w-24 rounded-md border border-amber-200 bg-amber-50/50 px-2 py-1.5 text-sm font-medium tabular-nums outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        ) : (
          <span className="tabular-nums text-slate-700">
            {product.salePrice != null ? product.salePrice.toFixed(2) : "—"}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        {view === "active" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onToggleStock(product)}
            className="inline-flex items-center gap-2"
            title={
              inStock
                ? "In Stock — click for Out of Stock"
                : "Out of Stock — click for In Stock"
            }
          >
            <span
              className={clsx(
                "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors",
                inStock ? "bg-emerald-500" : "bg-slate-300",
              )}
            >
              <span
                className={clsx(
                  "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                  inStock && "translate-x-5",
                )}
              />
            </span>
            <span
              className={clsx(
                "text-xs font-semibold",
                inStock ? "text-emerald-700" : "text-slate-500",
              )}
            >
              {inStock ? "In Stock" : "Out of Stock"}
            </span>
          </button>
        ) : (
          <span className="text-xs font-semibold text-slate-500">
            {inStock ? "In Stock" : "Out of Stock"}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        {view === "active" ? (
          <input
            type="number"
            min={0}
            step={1}
            disabled={busy}
            value={qtyDraft}
            onChange={(e) => setQtyDraft(e.target.value)}
            onBlur={() => void onSaveStockQty(product, qtyDraft)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm font-semibold tabular-nums outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        ) : (
          <span className="tabular-nums text-slate-700">
            {product.stockQuantity}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {view === "active" ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={onEdit}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onSoftDelete}
                className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={onRestore}
                className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                Restore
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onPermanentDelete}
                className="rounded-md border border-red-300 bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700"
              >
                Permanently Delete
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
