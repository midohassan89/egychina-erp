"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Download,
  Loader2,
  Package,
  Pencil,
  Plus,
  Scale,
  Search,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import { PermanentDeleteDialog } from "@/components/dashboard/PermanentDeleteDialog";
import { ProductEditModal } from "@/components/dashboard/ProductEditModal";
import type { ProductFormValues } from "@/components/products/ProductForm";
import {
  fetchLinkedVirtualProducts,
  LinkedProductsPriceModal,
} from "@/components/dashboard/LinkedProductsPriceModal";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import {
  downloadProductsExcel,
  downloadWeighedProductsExcel,
  parsePriceImportSheet,
} from "@/lib/products/excel";
import type { AdminProductRow } from "@/types/adminProduct";
import { clsx } from "clsx";
import { formatQty } from "@/lib/pos/money";

const PER_PAGE = 20;
const EXPORT_PAGE_SIZE = 10_000;
const EXPORT_ID_CHUNK = 150;

function SelectionCheckbox({
  checked,
  indeterminate = false,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  label: string;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={label}
      onChange={onChange}
      className="h-4 w-4 rounded border-slate-300"
    />
  );
}

function StockBadge({ quantity }: { quantity: number }) {
  const inStock = quantity > 0;
  return (
    <span
      className={clsx(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
        inStock ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700",
      )}
    >
      {inStock ? "متوفر" : "غير متوفر"}
    </span>
  );
}

function VisibilityToggle({
  active,
  disabled,
  onToggle,
}: {
  active: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      aria-pressed={active}
      title={
        active
          ? "مفعل — اضغط للإخفاء من الموقع والتطبيق"
          : "مخفي — اضغط للإظهار في الموقع والتطبيق"
      }
      className="inline-flex items-center gap-2 disabled:opacity-50"
    >
      <span
        className={clsx(
          "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors",
          active ? "bg-emerald-500" : "bg-slate-300",
        )}
      >
        <span
          className={clsx(
            "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
            active && "translate-x-5",
          )}
        />
      </span>
      <span
        className={clsx(
          "text-xs font-semibold",
          active ? "text-emerald-700" : "text-slate-500",
        )}
      >
        {active ? "مفعل" : "مخفي"}
      </span>
    </button>
  );
}

function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-800">
      <span>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900"
        aria-label={`إزالة ${label}`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

interface ProductsResponse {
  products: AdminProductRow[];
  total: number;
  page: number;
  perPage: number;
  pageCount: number;
  categories?: { id: string; name: string }[];
  brands?: { id: string; name: string }[];
  stockStatuses?: StockFilter[];
  error?: string;
}

type ViewMode = "active" | "weighed" | "trash";
type StockFilter = "all" | "instock" | "outofstock";
type ProductSort = "desc" | "asc" | "az";

function readProductSort(value: string | null): ProductSort {
  if (value === "asc" || value === "az") return value;
  return "desc";
}

function readPage(value: string | null): number {
  const page = Number(value);
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.floor(page);
}

export default function DashboardProductsPage() {
  return (
    <ToastProvider>
      <Suspense
        fallback={
          <p className="p-6 text-sm text-slate-500">جاري تحميل المنتجات…</p>
        }
      >
        <ProductsManagement />
      </Suspense>
    </ToastProvider>
  );
}

function ProductsManagement() {
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const priceImportInputRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<number | null>(null);
  const [products, setProducts] = useState<AdminProductRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(() => readPage(searchParams.get("page")));
  const [pageCount, setPageCount] = useState(1);
  const [searchInput, setSearchInput] = useState(
    () => searchParams.get("search") ?? "",
  );
  const [query, setQuery] = useState(() => searchParams.get("search") ?? "");
  const [sort, setSort] = useState<ProductSort>(() =>
    readProductSort(searchParams.get("sort")),
  );
  const [view, setView] = useState<ViewMode>("active");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [brandId, setBrandId] = useState("");
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [stockStatuses, setStockStatuses] = useState<
    Array<Exclude<StockFilter, "all">>
  >(["instock", "outofstock"]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editProduct, setEditProduct] = useState<AdminProductRow | null>(null);
  const [linkedPrompt, setLinkedPrompt] = useState<{
    baseProductId: string;
    baseName: string;
    regularPrice: number;
    salePrice: number | null;
  } | null>(null);
  const [isEditSaving, setIsEditSaving] = useState(false);
  const [deleteProduct, setDeleteProduct] = useState<AdminProductRow | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState("Working…");
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectingAll, setSelectingAll] = useState(false);

  const loadProducts = useCallback(
    async (
      pageNum: number,
      q: string,
      mode: ViewMode,
      stock: StockFilter = "all",
      category = "",
      brand = "",
      sortMode: ProductSort = "desc",
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
        if (mode === "weighed") params.set("weighed", "1");
        if (mode !== "trash" && category) params.set("categoryId", category);
        if (mode === "active" && brand) params.set("brandId", brand);
        if (stock === "instock" || stock === "outofstock") {
          params.set("stockStatus", stock);
        }
        if (sortMode !== "desc") params.set("sort", sortMode);

        const res = await fetch(`/api/products?${params.toString()}`);
        const data = (await res.json()) as ProductsResponse;
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to load products");
        }

        const nextPageCount = data.pageCount ?? 1;
        const nextPage = data.page ?? pageNum;
        setProducts(data.products ?? []);
        setTotal(data.total ?? 0);
        setPage(nextPage > nextPageCount ? nextPageCount : nextPage);
        setPageCount(nextPageCount);
        if (mode !== "trash" && Array.isArray(data.categories)) {
          setCategories(data.categories);
        }
        if (mode === "active" && Array.isArray(data.brands)) {
          setBrands(data.brands);
        }
        if (Array.isArray(data.stockStatuses)) {
          setStockStatuses(
            data.stockStatuses.filter(
              (status): status is Exclude<StockFilter, "all"> =>
                status === "instock" || status === "outofstock",
            ),
          );
        }
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
    void loadProducts(page, query, view, stockFilter, categoryId, brandId, sort);
  }, [loadProducts, page, query, view, stockFilter, categoryId, brandId, sort]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (query) params.set("search", query);
    else params.delete("search");
    if (page > 1) params.set("page", String(page));
    else params.delete("page");
    if (sort !== "desc") params.set("sort", sort);
    else params.delete("sort");
    const next = params.toString();
    if (next === searchParams.toString()) return;
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [page, pathname, query, router, searchParams, sort]);

  useEffect(() => {
    if (isLoading) return;
    const stockIsInvalid =
      stockFilter !== "all" && !stockStatuses.includes(stockFilter);
    if (stockIsInvalid) {
      startTransition(() => {
        setStockFilter("all");
        setPage(1);
      });
      return;
    }
    if (
      view !== "trash" &&
      categoryId &&
      !categories.some((category) => category.id === categoryId)
    ) {
      startTransition(() => {
        setCategoryId("");
        setPage(1);
      });
    }
    if (
      view === "active" &&
      brandId &&
      !brands.some((brand) => brand.id === brandId)
    ) {
      startTransition(() => {
        setBrandId("");
        setPage(1);
      });
    }
  }, [
    brands,
    brandId,
    categories,
    categoryId,
    isLoading,
    stockFilter,
    stockStatuses,
    view,
  ]);

  function commitSearch(value: string) {
    const next = value.trim();
    startTransition(() => {
      setQuery(next);
      setPage((currentPage) => (query === next ? currentPage : 1));
    });
  }

  function handleSearchInput(value: string) {
    setSearchInput(value);
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      commitSearch(value);
    }, 400);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    commitSearch(searchInput);
  }

  function handleClearSearch() {
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    setSearchInput("");
    startTransition(() => {
      setPage(1);
      setQuery("");
    });
  }

  function changeSort(next: ProductSort) {
    startTransition(() => {
      setSort(next);
      setPage(1);
    });
  }

  function switchView(mode: ViewMode) {
    startTransition(() => {
      setView(mode);
      setPage(1);
      setCategoryId("");
      setBrandId("");
    });
  }

  function changeCategory(next: string) {
    startTransition(() => {
      setCategoryId(next);
      setPage(1);
    });
  }

  function changeBrand(next: string) {
    startTransition(() => {
      setBrandId(next);
      setPage(1);
    });
  }

  function changeStockFilter(next: StockFilter) {
    startTransition(() => {
      setStockFilter(next);
      setPage(1);
    });
  }

  function clearAllFilters() {
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    setSearchInput("");
    startTransition(() => {
      setPage(1);
      setQuery("");
      setCategoryId("");
      setBrandId("");
      setStockFilter("all");
    });
  }

  useEffect(() => {
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, []);

  function productQuery(
    pageNum: number,
    perPage: number,
    extra?: { ids?: string[]; idsOnly?: boolean },
  ) {
    const params = new URLSearchParams({
      page: String(pageNum),
      perPage: String(perPage),
    });
    if (extra?.ids && extra.ids.length > 0) {
      params.set("ids", extra.ids.join(","));
      if (view === "weighed") params.set("weighed", "1");
      return params;
    }
    if (extra?.idsOnly) params.set("idsOnly", "1");
    if (query) params.set("q", query);
    if (view === "trash") params.set("trash", "1");
    if (view === "weighed") params.set("weighed", "1");
    if (view !== "trash" && categoryId) params.set("categoryId", categoryId);
    if (view === "active" && brandId) params.set("brandId", brandId);
    if (stockFilter === "instock" || stockFilter === "outofstock") {
      params.set("stockStatus", stockFilter);
    }
    if (sort !== "desc") params.set("sort", sort);
    return params;
  }

  async function fetchProductPage(params: URLSearchParams) {
    const res = await fetch(`/api/products?${params.toString()}`);
    const data = (await res.json()) as ProductsResponse & { ids?: string[] };
    if (!res.ok) {
      throw new Error(data.error ?? "Failed to load products for export");
    }
    return data;
  }

  async function fetchFilteredProducts(): Promise<AdminProductRow[]> {
    const all: AdminProductRow[] = [];
    let pageNum = 1;
    let pageCount = 1;
    do {
      const data = await fetchProductPage(
        productQuery(pageNum, EXPORT_PAGE_SIZE),
      );
      all.push(...(data.products ?? []));
      pageCount = data.pageCount ?? 1;
      pageNum += 1;
    } while (pageNum <= pageCount);
    return all;
  }

  async function fetchProductsByIds(ids: string[]): Promise<AdminProductRow[]> {
    const all: AdminProductRow[] = [];
    for (let index = 0; index < ids.length; index += EXPORT_ID_CHUNK) {
      const slice = ids.slice(index, index + EXPORT_ID_CHUNK);
      const data = await fetchProductPage(
        productQuery(1, slice.length, { ids: slice }),
      );
      all.push(...(data.products ?? []));
    }
    all.sort((a, b) => a.name.localeCompare(b.name, "ar"));
    return all;
  }

  function toggleProductSelected(id: string) {
    setSelectedProductIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function toggleSelectAll() {
    const visibleIds = products.map((product) => product.id);
    const allVisibleSelected =
      visibleIds.length > 0 &&
      visibleIds.every((id) => selectedProductIds.has(id));
    const allFilteredSelected =
      allVisibleSelected && selectedProductIds.size >= total && total > 0;
    if (allFilteredSelected) {
      setSelectedProductIds(new Set());
      return;
    }

    setSelectingAll(true);
    try {
      const data = await fetchProductPage(productQuery(1, 1, { idsOnly: true }));
      const ids = data.ids ?? [];
      setSelectedProductIds((current) => {
        const next = new Set(current);
        for (const id of ids) next.add(id);
        return next;
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not select products", "error");
    } finally {
      setSelectingAll(false);
    }
  }

  async function handleExportExcel() {
    setBulkBusy(true);
    setBulkMessage("Preparing Excel export…");
    try {
      const rows =
        selectedProductIds.size > 0
          ? await fetchProductsByIds([...selectedProductIds])
          : await fetchFilteredProducts();
      if (view === "weighed") {
        downloadWeighedProductsExcel(rows);
      } else {
        downloadProductsExcel(rows);
      }
      toast(`Exported ${rows.length} products`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Export failed", "error");
    } finally {
      setBulkBusy(false);
    }
  }

  async function handlePriceImport(file: File) {
    setBulkBusy(true);
    setBulkMessage("جاري استيراد الأسعار…");
    try {
      const rows = parsePriceImportSheet(await file.arrayBuffer());
      const res = await fetch("/api/products/import-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = (await res.json()) as {
        error?: string;
        updatedCount?: number;
        skippedCount?: number;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "تعذر استيراد الأسعار");
      }
      const updatedCount = data.updatedCount ?? 0;
      const skippedCount = data.skippedCount ?? 0;
      const summary =
        skippedCount > 0
          ? `تم تحديث ${updatedCount} منتج، وتم تخطي ${skippedCount}`
          : `تم تحديث ${updatedCount} منتج`;
      toast(summary, updatedCount > 0 ? "success" : "error");
      if (updatedCount > 0) {
        await loadProducts(page, query, view, stockFilter, categoryId, brandId);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "تعذر استيراد الأسعار", "error");
    } finally {
      setBulkBusy(false);
      if (priceImportInputRef.current) priceImportInputRef.current.value = "";
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
  ): Promise<boolean> {
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
      return true;
    } catch (err) {
      toast(err instanceof Error ? err.message : "Update failed", "error");
      await loadProducts(page, query, view, stockFilter);
      return false;
    } finally {
      setSavingId(null);
    }
  }

  async function offerLinkedPrices(
    product: AdminProductRow,
    regularPrice: number,
    salePrice: number | null,
  ) {
    const linked = await fetchLinkedVirtualProducts(product.id);
    if (linked.length === 0) return;
    setLinkedPrompt({
      baseProductId: product.id,
      baseName: product.name,
      regularPrice,
      salePrice,
    });
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
    const saved = await patchProduct(product.id, { price }, "Price updated");
    if (saved) {
      await offerLinkedPrices(product, price, product.salePrice);
    }
  }

  async function saveSalePrice(product: AdminProductRow, raw: string) {
    const trimmed = raw.trim();
    if (trimmed === "") {
      if (product.salePrice == null) return;
      const saved = await patchProduct(
        product.id,
        { salePrice: null },
        "Sale price cleared",
      );
      if (saved) await offerLinkedPrices(product, product.price, null);
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
    const saved = await patchProduct(
      product.id,
      { salePrice: normalized },
      "Sale price updated",
    );
    if (saved) await offerLinkedPrices(product, product.price, normalized);
  }

  async function toggleVisibility(product: AdminProductRow) {
    const next = !product.isActive;
    setSavingId(product.id);
    try {
      const res = await fetch(`/api/products/${product.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: next }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "تعذر تحديث حالة العرض");
      patchLocal(product.id, { isActive: next });
      toast(
        next
          ? "المنتج ظاهر في الموقع والتطبيق"
          : "المنتج مخفي من الموقع والتطبيق",
        "success",
      );
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "تعذر تحديث حالة العرض",
        "error",
      );
    } finally {
      setSavingId(null);
    }
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

  async function saveEdit(values: ProductFormValues) {
    if (!editProduct) return;
    setIsEditSaving(true);
    try {
      const res = await fetch(`/api/products/${editProduct.id}`, {
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
        product?: AdminProductRow;
      };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      if (data.product) patchLocal(editProduct.id, data.product);
      toast("Product details saved & synced", "success");
      setEditProduct(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed";
      toast(message, "error");
      throw err instanceof Error ? err : new Error(message);
    } finally {
      setIsEditSaving(false);
    }
  }

  async function permanentDelete() {
    if (!deleteProduct) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/products/${deleteProduct.id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      setProducts((prev) => prev.filter((p) => p.id !== deleteProduct.id));
      setTotal((t) => Math.max(0, t - 1));
      toast("تم الحذف النهائي", "success");
      setDeleteProduct(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed", "error");
    } finally {
      setIsDeleting(false);
    }
  }

  function applyWeighedPrices(
    productId: string,
    patch: Partial<Pick<AdminProductRow, "price" | "salePrice" | "buyingCost" | "lastPurchasePrice">>,
  ) {
    setProducts((current) =>
      current.map((product) =>
        product.id === productId ? { ...product, ...patch } : product,
      ),
    );
  }
  const from = total === 0 ? 0 : (page - 1) * PER_PAGE + 1;
  const to = Math.min(page * PER_PAGE, total);
  const colSpan = view === "weighed" ? 9 : 12;
  const visibleIds = products.map((product) => product.id);
  const allVisibleSelected =
    visibleIds.length > 0 &&
    visibleIds.every((id) => selectedProductIds.has(id));
  const allFilteredSelected =
    allVisibleSelected && selectedProductIds.size >= total && total > 0;
  const someVisibleSelected = visibleIds.some((id) =>
    selectedProductIds.has(id),
  );
  const categoryName =
    categories.find((category) => category.id === categoryId)?.name ?? "";
  const brandName = brands.find((brand) => brand.id === brandId)?.name ?? "";
  const stockLabel =
    stockFilter === "instock"
      ? "متوفر"
      : stockFilter === "outofstock"
        ? "غير متوفر"
        : "";
  const hasActiveFilters = Boolean(
    categoryId || brandId || stockLabel || query,
  );

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
            إدارة المنتجات
          </h1>
          <p className="mt-1 text-slate-500">
            كتالوج المنتجات المحلي
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
                إضافة جديد
              </Link>
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
            كل المنتجات
          </button>
          <button
            type="button"
            onClick={() => switchView("weighed")}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-t-lg border border-b-0 px-4 py-2 text-sm font-semibold",
              view === "weighed"
                ? "border-slate-200 bg-white text-slate-900"
                : "border-transparent bg-slate-50 text-slate-500 hover:text-slate-800",
            )}
          >
            <Scale className="h-3.5 w-3.5" />
            منتجات الميزان
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
            سلة المهملات
          </button>
        </div>

        <div className="flex flex-col gap-3 border-b border-slate-200 p-4">
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
            <form
              onSubmit={handleSearchSubmit}
              className="flex w-full min-w-0 flex-col gap-2 sm:min-w-[20rem] sm:flex-1 sm:flex-row sm:items-center"
            >
              <div className="relative w-full min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => handleSearchInput(e.target.value)}
                  placeholder="بحث بالاسم أو الباركود…"
                  className="block w-full min-w-0 rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </div>
              <label className="flex w-full items-center gap-2 text-sm text-slate-600 sm:w-auto">
                <span className="whitespace-nowrap font-medium">الترتيب</span>
                <select
                  value={sort}
                  onChange={(e) => changeSort(e.target.value as ProductSort)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 sm:w-auto"
                >
                  <option value="desc">الأحدث</option>
                  <option value="asc">الأقدم</option>
                  <option value="az">أ-ي</option>
                </select>
              </label>
              <div className="flex w-full gap-2 sm:w-auto">
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  بحث
                </button>
                {query && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    إلغاء
                  </button>
                )}
              </div>
            </form>

            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
              {view !== "trash" && (
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <span className="whitespace-nowrap font-medium">القسم</span>
                  <select
                    value={categoryId}
                    onChange={(e) => changeCategory(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  >
                    <option value="">كل الأقسام</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {view === "active" && (
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <span className="whitespace-nowrap font-medium">
                    العلامة التجارية
                  </span>
                  <select
                    value={brandId}
                    onChange={(e) => changeBrand(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  >
                    <option value="">كل العلامات التجارية</option>
                    {brands.map((brand) => (
                      <option key={brand.id} value={brand.id}>
                        {brand.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <span className="whitespace-nowrap font-medium">المخزون</span>
                <select
                  value={stockFilter}
                  onChange={(e) =>
                    changeStockFilter(e.target.value as StockFilter)
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                >
                  <option value="all">الكل</option>
                  {stockStatuses.includes("instock") && (
                    <option value="instock">متوفر</option>
                  )}
                  {stockStatuses.includes("outofstock") && (
                    <option value="outofstock">غير متوفر</option>
                  )}
                </select>
              </label>

              {selectedProductIds.size > 0 && (
                <span className="text-sm font-medium text-slate-600">
                  تم تحديد {selectedProductIds.size.toLocaleString("ar-EG")} منتجات
                </span>
              )}
              {view !== "trash" && (
                <>
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() => void handleExportExcel()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" />
                    تصدير Excel
                  </button>
                  <button
                    type="button"
                    disabled={bulkBusy}
                    title="تحديث السعر الأساسي وسعر التخفيض وآخر سعر شراء حسب الباركود أو كود الصنف"
                    onClick={() => priceImportInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Upload className="h-4 w-4" />
                    استيراد من Excel
                  </button>
                  <input
                    ref={priceImportInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handlePriceImport(file);
                    }}
                  />
                </>
              )}
            </div>
          </div>
          <p className="text-sm text-slate-500">
            {isLoading || isPending
              ? "جاري التحميل…"
              : `${total.toLocaleString("ar-EG")} ${
                  view === "trash"
                    ? "في سلة المهملات"
                    : view === "weighed"
                      ? "منتج ميزان"
                      : "منتج"
                }`}
            {stockLabel ? (
              <span className="text-slate-400"> · {stockLabel}</span>
            ) : null}
          </p>
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-600">
                تصفية حسب:
              </span>
              {query && (
                <FilterChip
                  label={`بحث: ${query}`}
                  onRemove={handleClearSearch}
                />
              )}
              {categoryId && (
                <FilterChip
                  label={`القسم: ${categoryName || "—"}`}
                  onRemove={() => changeCategory("")}
                />
              )}
              {brandId && (
                <FilterChip
                  label={`العلامة التجارية: ${brandName || "—"}`}
                  onRemove={() => changeBrand("")}
                />
              )}
              {stockLabel && (
                <FilterChip
                  label={`المخزون: ${stockLabel}`}
                  onRemove={() => changeStockFilter("all")}
                />
              )}
              <button
                type="button"
                onClick={clearAllFilters}
                className="rounded-lg px-2 py-1 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                إزالة الفلاتر
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table
            className={clsx(
              "w-full text-left text-sm",
              view === "weighed" ? "min-w-[1280px]" : "min-w-[1240px]",
            )}
          >
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              {view === "weighed" ? (
                <tr>
                  <th className="w-10 px-3 py-3">
                    <SelectionCheckbox
                      checked={allFilteredSelected}
                      indeterminate={!allFilteredSelected && someVisibleSelected}
                      disabled={isLoading || selectingAll || products.length === 0}
                      label="تحديد كل المنتجات"
                      onChange={() => void toggleSelectAll()}
                    />
                  </th>
                  <th className="px-4 py-3 font-semibold">الصورة</th>
                  <th className="px-4 py-3 font-semibold">اسم المنتج</th>
                  <th className="px-4 py-3 font-semibold">الباركود</th>
                  <th className="px-4 py-3 font-semibold">الكمية</th>
                  <th className="px-4 py-3 font-semibold">حالة العرض</th>
                  <th className="px-4 py-3 font-semibold">السعر الأساسي</th>
                  <th className="px-4 py-3 font-semibold">سعر التخفيض</th>
                  <th className="px-4 py-3 font-semibold">آخر سعر شراء</th>
                </tr>
              ) : (
              <tr>
                <th className="w-10 px-3 py-3">
                  <SelectionCheckbox
                    checked={allFilteredSelected}
                    indeterminate={!allFilteredSelected && someVisibleSelected}
                    disabled={isLoading || selectingAll || products.length === 0}
                    label="تحديد كل المنتجات"
                    onChange={() => void toggleSelectAll()}
                  />
                </th>
                <th className="px-4 py-3 font-semibold">★</th>
                <th className="px-4 py-3 font-semibold">الصورة</th>
                <th className="px-4 py-3 font-semibold">اسم المنتج</th>
                <th className="px-4 py-3 font-semibold">الباركود</th>
                <th className="px-4 py-3 font-semibold">باركود العبوات</th>
                <th className="px-4 py-3 font-semibold">السعر</th>
                <th className="px-4 py-3 font-semibold">سعر التخفيض</th>
                <th className="px-4 py-3 font-semibold">حالة المخزون</th>
                <th className="px-4 py-3 font-semibold">حالة العرض</th>
                <th className="px-4 py-3 font-semibold">الكمية</th>
                <th className="px-4 py-3 font-semibold">الإجراءات</th>
              </tr>
              )}
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && products.length === 0 ? (
                <tr>
                  <td
                    colSpan={colSpan}
                    className="px-4 py-16 text-center text-slate-400"
                  >
                    جاري تحميل المنتجات…
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-16 text-center">
                    <Package className="mx-auto h-10 w-10 text-slate-300" />
                    <p className="mt-3 font-medium text-slate-600">
                      {view === "trash"
                        ? "سلة المهملات فارغة"
                        : view === "weighed"
                          ? "لا توجد منتجات ميزان"
                          : "لا توجد منتجات"}
                    </p>
                  </td>
                </tr>
              ) : view === "weighed" ? (
                products.map((product) => (
                  <WeighedProductRow
                    key={product.id}
                    product={product}
                    selected={selectedProductIds.has(product.id)}
                    onToggleSelected={() => toggleProductSelected(product.id)}
                    visibilityBusy={savingId === product.id}
                    onToggleVisibility={() => void toggleVisibility(product)}
                    onSaved={(patch) => {
                      applyWeighedPrices(product.id, patch);
                      if (patch.price !== undefined || patch.salePrice !== undefined) {
                        void offerLinkedPrices(
                          product,
                          patch.price ?? product.price,
                          patch.salePrice !== undefined
                            ? patch.salePrice
                            : product.salePrice,
                        );
                      }
                    }}
                  />
                ))
              ) : (
                products.map((product) => (
                  <ProductRow
                    key={product.id}
                    product={product}
                    view={view}
                    selected={selectedProductIds.has(product.id)}
                    onToggleSelected={() => toggleProductSelected(product.id)}
                    busy={savingId === product.id}
                    onSavePrice={savePrice}
                    onSaveSalePrice={saveSalePrice}
                    onToggleVisibility={() => void toggleVisibility(product)}
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
              ? "لا نتائج"
              : `عرض ${from}–${to} من ${total.toLocaleString("ar-EG")}`}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              السابق
            </button>
            <span className="min-w-[5.5rem] text-center text-sm tabular-nums text-slate-600">
              صفحة {page} / {pageCount}
            </span>
            <button
              type="button"
              disabled={page >= pageCount || isLoading}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              التالي
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
      {linkedPrompt && (
        <LinkedProductsPriceModal
          open
          baseProductId={linkedPrompt.baseProductId}
          baseProductName={linkedPrompt.baseName}
          regularPrice={linkedPrompt.regularPrice}
          salePrice={linkedPrompt.salePrice}
          onClose={() => setLinkedPrompt(null)}
          onSaved={() => toast("Linked product prices updated", "success")}
        />
      )}

      {deleteProduct && (
        <PermanentDeleteDialog
          product={deleteProduct}
          open={!!deleteProduct}
          isDeleting={isDeleting}
          onClose={() => !isDeleting && setDeleteProduct(null)}
          onConfirm={() => void permanentDelete()}
        />
      )}

    </div>
  );
}

function ProductRow({
  product,
  view,
  selected,
  onToggleSelected,
  busy,
  onSavePrice,
  onSaveSalePrice,
  onToggleVisibility,
  onToggleFavorite,
  onEdit,
  onSoftDelete,
  onRestore,
  onPermanentDelete,
}: {
  product: AdminProductRow;
  view: ViewMode;
  selected: boolean;
  onToggleSelected: () => void;
  busy: boolean;
  onSavePrice: (product: AdminProductRow, raw: string) => Promise<void>;
  onSaveSalePrice: (product: AdminProductRow, raw: string) => Promise<void>;
  onToggleVisibility: () => void;
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
  useEffect(() => {
    setPriceDraft(String(product.price));
  }, [product.price]);

  useEffect(() => {
    setSaleDraft(product.salePrice != null ? String(product.salePrice) : "");
  }, [product.salePrice]);

  return (
    <tr className={clsx("hover:bg-slate-50/80", busy && "opacity-60")}>
      <td className="px-3 py-3">
        <SelectionCheckbox
          checked={selected}
          label={`تحديد ${product.name}`}
          onChange={onToggleSelected}
        />
      </td>
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
        <Link
          href={`/dashboard/products/${product.id}`}
          className="line-clamp-2 font-medium text-slate-900 hover:text-brand-700 hover:underline"
        >
          {product.name}
        </Link>
        <p className="mt-0.5 text-xs text-slate-400">WC #{product.wcId}</p>
      </td>
      <td className="px-4 py-3 font-mono text-xs text-slate-600">
        {product.barcode || "—"}
      </td>
      <td className="px-4 py-3">
        {product.packages && product.packages.length > 0 ? (
          <div className="flex flex-col gap-1">
            {product.packages.map((pkg) => (
              <span
                key={pkg.id}
                className="text-xs text-slate-500"
                title={pkg.name}
              >
                <span className="font-mono text-slate-700">{pkg.barcode}</span>
                {pkg.name ? (
                  <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                    {pkg.name}
                  </span>
                ) : null}
              </span>
            ))}
          </div>
        ) : (
          "—"
        )}
      </td>
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
        <StockBadge quantity={product.stockQuantity} />
      </td>
      <td className="px-4 py-3">
        <VisibilityToggle
          active={product.isActive}
          disabled={busy}
          onToggle={onToggleVisibility}
        />
      </td>
      <td className="px-4 py-3">
        {product.linkedProductId ? (
          <span
            className="inline-flex rounded-md bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-800 ring-1 ring-inset ring-violet-200"
            title={`Virtual pack ×${product.bundleMultiplier ?? "?"}`}
          >
            Bundle ×{product.bundleMultiplier ?? "?"}
          </span>
        ) : view === "active" ? (
          <div className="max-w-[16rem]">
            <input
              type="number"
              readOnly
              value={product.stockQuantity}
              className="w-20 cursor-not-allowed rounded-md border border-slate-300 bg-gray-100 px-2 py-1.5 text-sm font-semibold tabular-nums text-gray-500"
              aria-label="Stock quantity"
            />
            <p className="mt-1 text-[11px] leading-snug text-gray-500">
              الرصيد للعرض فقط. لتعديل الرصيد، يرجى استخدام (أرصدة أول المدة) أو (فواتير المشتريات) للحفاظ على دقة كارت الصنف.
            </p>
          </div>
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
                تعديل
              </button>
              <Link
                href={`/dashboard/products/${product.id}`}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                كارت الصنف
              </Link>
              <button
                type="button"
                disabled={busy}
                onClick={onSoftDelete}
                className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-3 w-3" />
                حذف
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
                استعادة
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onPermanentDelete}
                className="rounded-md border border-red-300 bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700"
              >
                حذف نهائي
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function moneyDraft(value: number | null | undefined) {
  return value != null && Number.isFinite(value) ? value.toFixed(2) : "";
}

function purchasePriceOf(product: AdminProductRow) {
  const value = product.lastPurchasePrice ?? product.buyingCost ?? 0;
  return Number.isFinite(value) ? value : 0;
}

function WeighedPriceField({
  label,
  value,
  allowEmpty,
  saving,
  onSave,
}: {
  label: string;
  value: string;
  allowEmpty?: boolean;
  saving: boolean;
  onSave: (raw: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        step="0.01"
        disabled={saving}
        value={draft}
        placeholder={allowEmpty ? "—" : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave(draft);
        }}
        aria-label={label}
        className="w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm font-medium tabular-nums outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
      />
      <button
        type="button"
        disabled={saving}
        onClick={() => onSave(draft)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
        title={`حفظ ${label}`}
        aria-label={`حفظ ${label}`}
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Check className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}

function WeighedProductRow({
  product,
  selected,
  onToggleSelected,
  visibilityBusy,
  onToggleVisibility,
  onSaved,
}: {
  product: AdminProductRow;
  selected: boolean;
  onToggleSelected: () => void;
  visibilityBusy: boolean;
  onToggleVisibility: () => void;
  onSaved: (
    patch: Partial<Pick<AdminProductRow, "price" | "salePrice" | "buyingCost" | "lastPurchasePrice">>,
  ) => void;
}) {
  const { toast } = useToast();
  const [savingField, setSavingField] = useState<"price" | "sale" | "cost" | null>(null);
  const barcode = product.barcode?.trim() || product.sku?.trim() || "—";

  async function saveField(
    field: "price" | "sale" | "cost",
    raw: string,
  ) {
    const trimmed = raw.trim();
    const payload: { price?: number; salePrice?: number | null; buyingCost?: number } = {};

    if (field === "sale" && trimmed === "") {
      if (product.salePrice == null) return;
      payload.salePrice = null;
    } else {
      const amount = Number(trimmed);
      if (!Number.isFinite(amount) || amount < 0) {
        toast(
          field === "price"
            ? "السعر الأساسي غير صالح"
            : field === "sale"
              ? "سعر التخفيض غير صالح"
              : "سعر الشراء غير صالح",
          "error",
        );
        return;
      }
      if (field === "price") {
        if (amount === product.price) return;
        payload.price = amount;
      } else if (field === "sale") {
        const next = amount > 0 ? amount : null;
        if (next === product.salePrice) return;
        payload.salePrice = next;
      } else if (amount === purchasePriceOf(product)) {
        return;
      } else {
        payload.buyingCost = amount;
      }
    }

    setSavingField(field);
    try {
      const res = await fetch(`/api/products/${product.id}/purchase-price`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as {
        error?: string;
        price?: number;
        salePrice?: number | null;
        buyingCost?: number;
      };
      if (!res.ok) throw new Error(body.error || "تعذر حفظ السعر");

      onSaved({
        ...(payload.price !== undefined ? { price: body.price ?? payload.price } : {}),
        ...(payload.salePrice !== undefined
          ? { salePrice: body.salePrice ?? payload.salePrice }
          : {}),
        ...(payload.buyingCost !== undefined
          ? {
              buyingCost: body.buyingCost ?? payload.buyingCost,
              lastPurchasePrice: body.buyingCost ?? payload.buyingCost,
            }
          : {}),
      });
      toast(
        field === "price"
          ? "تم حفظ السعر الأساسي"
          : field === "sale"
            ? "تم حفظ سعر التخفيض"
            : "تم حفظ سعر الشراء",
        "success",
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "تعذر حفظ السعر", "error");
    } finally {
      setSavingField(null);
    }
  }

  return (
    <tr className="hover:bg-slate-50/80">
      <td className="px-3 py-3">
        <SelectionCheckbox
          checked={selected}
          label={`تحديد ${product.name}`}
          onChange={onToggleSelected}
        />
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
        <Link
          href={`/dashboard/products/${product.id}`}
          className="line-clamp-2 font-medium text-slate-900 hover:text-brand-700 hover:underline"
        >
          {product.name}
        </Link>
        {product.categoryName ? (
          <p className="mt-0.5 text-xs text-slate-400">{product.categoryName}</p>
        ) : null}
      </td>
      <td className="px-4 py-3 font-mono text-xs text-slate-600">{barcode}</td>
      <td className="px-4 py-3 tabular-nums text-slate-700">
        {formatQty(product.stockQuantity)} كجم
      </td>
      <td className="px-4 py-3">
        <VisibilityToggle
          active={product.isActive}
          disabled={visibilityBusy}
          onToggle={onToggleVisibility}
        />
      </td>
      <td className="px-4 py-3">
        <WeighedPriceField
          label="السعر الأساسي"
          value={moneyDraft(product.price)}
          saving={savingField === "price"}
          onSave={(raw) => void saveField("price", raw)}
        />
      </td>
      <td className="px-4 py-3">
        <WeighedPriceField
          label="سعر التخفيض"
          value={moneyDraft(product.salePrice)}
          allowEmpty
          saving={savingField === "sale"}
          onSave={(raw) => void saveField("sale", raw)}
        />
      </td>
      <td className="px-4 py-3">
        <WeighedPriceField
          label="آخر سعر شراء"
          value={moneyDraft(purchasePriceOf(product))}
          saving={savingField === "cost"}
          onSave={(raw) => void saveField("cost", raw)}
        />
      </td>
    </tr>
  );
}
