"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  BadgePercent,
  Check,
  Loader2,
  Percent,
  Plus,
  Search,
  Tag,
  Trash2,
  Wallet,
} from "lucide-react";
import { formatEGP, roundMoney } from "@/lib/pos/money";

interface SupplierOption {
  id: number;
  name: string;
}

interface ProductOption {
  id: string;
  wcId: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  stockQuantity: number;
  price: number;
  salePrice: number | null;
}

interface LineDraft {
  key: string;
  productId: string;
  productName: string;
  quantity: string;
  unitCost: string;
  lineTotal: string;
  regularPrice: string;
  salePrice: string;
  /** False until selling prices are loaded from the product record. */
  priceSeeded: boolean;
}

type PriceSyncState = "saving" | "saved" | "error";

function formatSaleInput(salePrice: number | null | undefined): string {
  return salePrice != null && salePrice > 0 ? String(salePrice) : "";
}

/** Retail margin on the active price (sale price when set, otherwise regular). */
function profitMarginPercent(
  unitCost: string,
  regularPrice: string,
  salePrice: string,
): number | null {
  const cost = Number(unitCost);
  const regular = Number(regularPrice);
  const saleRaw = salePrice.trim();
  const sale = saleRaw === "" ? NaN : Number(saleRaw);
  const active = Number.isFinite(sale) && sale > 0 ? sale : regular;
  if (!Number.isFinite(active) || active <= 0 || !Number.isFinite(cost)) {
    return null;
  }
  return ((active - cost) / active) * 100;
}

function priceSignature(regularPrice: string, salePrice: string): string {
  const regular = Number(regularPrice);
  const saleRaw = salePrice.trim();
  const sale = saleRaw === "" ? "" : String(Number(saleRaw));
  return `${Number.isFinite(regular) ? regular : ""}|${sale}`;
}

function newKey() {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const DRAFT_STORAGE_KEY = "draft_purchase_order";

interface PurchaseDraftPayload {
  supplierId: string;
  invoiceNumber: string;
  date: string;
  paidAmount: string;
  lines: LineDraft[];
}

function readPurchaseDraft(): PurchaseDraftPayload | null {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PurchaseDraftPayload>;
    if (!parsed || typeof parsed !== "object") return null;
    const lines = Array.isArray(parsed.lines)
      ? parsed.lines
          .filter(
            (line): line is LineDraft =>
              !!line &&
              typeof line === "object" &&
              typeof line.productId === "string" &&
              line.productId.length > 0,
          )
          .map((line) => ({
            key:
              typeof line.key === "string" && line.key
                ? line.key
                : newKey(),
            productId: line.productId,
            productName:
              typeof line.productName === "string"
                ? line.productName
                : "Product",
            quantity: String(line.quantity ?? "1"),
            unitCost: String(line.unitCost ?? "0"),
            lineTotal: String(
              line.lineTotal ??
                roundMoney(
                  (Math.floor(Number(line.quantity)) || 0) *
                    (Number(line.unitCost) || 0),
                ),
            ),
            regularPrice:
              typeof line.regularPrice === "string" ? line.regularPrice : "",
            salePrice: typeof line.salePrice === "string" ? line.salePrice : "",
            priceSeeded: typeof line.regularPrice === "string",
          }))
      : [];
    return {
      supplierId:
        typeof parsed.supplierId === "string" ? parsed.supplierId : "",
      invoiceNumber:
        typeof parsed.invoiceNumber === "string" ? parsed.invoiceNumber : "",
      date:
        typeof parsed.date === "string" && parsed.date
          ? parsed.date
          : new Date().toISOString().slice(0, 10),
      paidAmount:
        typeof parsed.paidAmount === "string" ? parsed.paidAmount : "0",
      lines,
    };
  } catch {
    return null;
  }
}

function clearPurchaseDraft() {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // ignore quota / private-mode errors
  }
}

function pickBestProduct(
  products: ProductOption[],
  query: string,
): ProductOption | undefined {
  const q = query.trim().toLowerCase();
  if (!q || products.length === 0) return undefined;
  const exact = products.find(
    (p) =>
      p.barcode?.toLowerCase() === q ||
      p.sku?.toLowerCase() === q ||
      p.name.toLowerCase() === q,
  );
  return exact ?? products[0];
}

async function fetchLastPurchaseCost(productId: string): Promise<number> {
  try {
    const res = await fetch(
      `/api/inventory/unit-cost?productId=${encodeURIComponent(productId)}&purchaseOnly=1`,
    );
    if (!res.ok) return 0;
    const body = (await res.json()) as { unitCost?: number };
    const cost = Number(body.unitCost);
    return Number.isFinite(cost) && cost >= 0 ? roundMoney(cost) : 0;
  } catch {
    return 0;
  }
}

export default function NewPurchaseInvoicePage() {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-slate-500">Loading purchase form…</p>
      }
    >
      <NewPurchaseInvoicePageInner />
    </Suspense>
  );
}

function NewPurchaseInvoicePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paidAmount, setPaidAmount] = useState("0");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [productHits, setProductHits] = useState<ProductOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNote, setSuccessNote] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const prefilledRef = useRef(false);
  const allowUnloadRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const focusQtyKeyRef = useRef<string | null>(null);
  const qtyInputRefs = useRef(new Map<string, HTMLInputElement>());
  const costInputRefs = useRef(new Map<string, HTMLInputElement>());
  const totalInputRefs = useRef(new Map<string, HTMLInputElement>());
  const [priceSync, setPriceSync] = useState<Record<string, PriceSyncState>>({});
  const [priceSyncError, setPriceSyncError] = useState<Record<string, string>>({});
  const priceSyncTimers = useRef(new Map<string, number>());
  const lastSyncedPrices = useRef(new Map<string, string>());
  const priceSyncGen = useRef(new Map<string, number>());

  // Restore draft on mount (before any auto-save writes)
  useEffect(() => {
    const draft = readPurchaseDraft();
    if (draft) {
      setSupplierId(draft.supplierId);
      setInvoiceNumber(draft.invoiceNumber);
      setDate(draft.date);
      setPaidAmount(draft.paidAmount);
      setLines(draft.lines);
      if (draft.lines.length > 0) {
        // Prefer restored draft over Reports "Order Now" prefill
        prefilledRef.current = true;
      }
    }
    setDraftReady(true);
  }, []);

  // Persist draft whenever form fields change
  useEffect(() => {
    if (!draftReady) return;
    try {
      const payload: PurchaseDraftPayload = {
        supplierId,
        invoiceNumber,
        date,
        paidAmount,
        lines,
      };
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore quota / private-mode errors
    }
  }, [draftReady, supplierId, invoiceNumber, date, paidAmount, lines]);

  // Warn before refresh/close when there are line items
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (allowUnloadRef.current || lines.length === 0) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [lines.length]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/suppliers");
      if (!res.ok) return;
      const body = (await res.json()) as { suppliers?: SupplierOption[] };
      setSuppliers(body.suppliers ?? []);
    })();
  }, []);

  useEffect(() => {
    const q = productQuery.trim();
    if (q.length < 1) {
      setProductHits([]);
      return;
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        setSearching(true);
        try {
          const res = await fetch(
            `/api/products?page=1&perPage=15&q=${encodeURIComponent(q)}`,
          );
          const body = (await res.json()) as {
            products?: ProductOption[];
          };
          setProductHits(body.products ?? []);
        } finally {
          setSearching(false);
        }
      })();
    }, 250);

    return () => window.clearTimeout(timer);
  }, [productQuery]);

  // After a product is added, focus its Quantity field
  useEffect(() => {
    const key = focusQtyKeyRef.current;
    if (!key) return;
    focusQtyKeyRef.current = null;
    const focus = () => {
      const el = qtyInputRefs.current.get(key);
      if (!el) return;
      el.focus();
      el.select();
    };
    requestAnimationFrame(focus);
  }, [lines]);

  const totalAmount = useMemo(
    () =>
      roundMoney(
        lines.reduce((sum, line) => {
          const stored = Number(line.lineTotal);
          if (Number.isFinite(stored)) return sum + stored;
          const qty = Math.floor(Number(line.quantity)) || 0;
          const cost = Number(line.unitCost) || 0;
          return sum + qty * cost;
        }, 0),
      ),
    [lines],
  );

  const paid = roundMoney(Math.max(0, Number(paidAmount) || 0));
  const dueAmount = roundMoney(Math.max(0, totalAmount - paid));
  const previewStatus =
    dueAmount <= 0.001 ? "PAID" : paid > 0.001 ? "PARTIAL" : "UNPAID";

  const addProduct = useCallback(async (product: ProductOption) => {
    const lastCost = await fetchLastPurchaseCost(product.id);

    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        focusQtyKeyRef.current = existing.key;
        const qty = Math.max(
          1,
          (Math.floor(Number(existing.quantity)) || 0) + 1,
        );
        const cost = Number(existing.unitCost) || 0;
        return prev.map((l) =>
          l.productId === product.id
            ? {
                ...l,
                quantity: String(qty),
                lineTotal: String(roundMoney(qty * cost)),
              }
            : l,
        );
      }

      const key = newKey();
      focusQtyKeyRef.current = key;
      const qty = 1;
      lastSyncedPrices.current.set(
        product.id,
        priceSignature(String(product.price ?? 0), formatSaleInput(product.salePrice)),
      );
      return [
        ...prev,
        {
          key,
          productId: product.id,
          productName: product.name,
          quantity: "1",
          unitCost: String(lastCost),
          lineTotal: String(roundMoney(qty * lastCost)),
          regularPrice: String(product.price ?? 0),
          salePrice: formatSaleInput(product.salePrice),
          priceSeeded: true,
        },
      ];
    });
    setProductQuery("");
    setProductHits([]);
    setError(null);
  }, []);

  // Prefill line from Reports "Order Now" (?productId=) — wait for draft restore
  useEffect(() => {
    if (!draftReady) return;
    const productId = searchParams.get("productId")?.trim();
    if (!productId || prefilledRef.current) return;
    prefilledRef.current = true;
    void (async () => {
      try {
        const res = await fetch(
          `/api/inventory/unit-cost?productId=${encodeURIComponent(productId)}&purchaseOnly=1`,
        );
        if (!res.ok) return;
        const body = (await res.json()) as {
          productId?: string;
          name?: string;
          unitCost?: number;
          sellPrice?: number;
          salePrice?: number | null;
        };
        if (!body.productId) return;
        const cost = Number(body.unitCost) || 0;
        const regularPrice = String(body.sellPrice ?? 0);
        const salePrice = formatSaleInput(body.salePrice);
        lastSyncedPrices.current.set(
          body.productId,
          priceSignature(regularPrice, salePrice),
        );
        setLines((prev) => {
          if (prev.some((l) => l.productId === body.productId)) return prev;
          const key = newKey();
          focusQtyKeyRef.current = key;
          return [
            ...prev,
            {
              key,
              productId: body.productId!,
              productName: body.name ?? "Reorder item",
              quantity: "1",
              unitCost: String(cost),
              lineTotal: String(roundMoney(1 * cost)),
              regularPrice,
              salePrice,
              priceSeeded: true,
            },
          ];
        });
      } catch {
        // ignore prefill errors
      }
    })();
  }, [draftReady, searchParams]);

  useEffect(() => {
    if (!draftReady) return;
    const missing = lines.filter((line) => !line.priceSeeded);
    if (missing.length === 0) return;
    let cancelled = false;

    void Promise.all(
      missing.map(async (line) => {
        try {
          const res = await fetch(
            `/api/inventory/unit-cost?productId=${encodeURIComponent(line.productId)}&purchaseOnly=1`,
          );
          if (!res.ok) throw new Error("price lookup failed");
          const body = (await res.json()) as {
            sellPrice?: number;
            salePrice?: number | null;
          };
          if (cancelled) return;
          const regularPrice = String(body.sellPrice ?? 0);
          const salePrice = formatSaleInput(body.salePrice);
          lastSyncedPrices.current.set(
            line.productId,
            priceSignature(regularPrice, salePrice),
          );
          setLines((prev) =>
            prev.map((row) =>
              row.key === line.key && !row.priceSeeded
                ? { ...row, regularPrice, salePrice, priceSeeded: true }
                : row,
            ),
          );
        } catch {
          if (cancelled) return;
          setLines((prev) =>
            prev.map((row) =>
              row.key === line.key ? { ...row, priceSeeded: true } : row,
            ),
          );
        }
      }),
    );

    return () => {
      cancelled = true;
    };
  }, [draftReady, lines]);

  function updateQuantity(key: string, quantity: string) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const qty = Math.floor(Number(quantity)) || 0;
        const cost = Number(line.unitCost) || 0;
        return {
          ...line,
          quantity,
          lineTotal: String(roundMoney(qty * cost)),
        };
      }),
    );
  }

  function updateUnitCost(key: string, unitCost: string) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const qty = Math.floor(Number(line.quantity)) || 0;
        const cost = Number(unitCost) || 0;
        return {
          ...line,
          unitCost,
          lineTotal: String(roundMoney(qty * cost)),
        };
      }),
    );
  }

  function updateLineTotal(key: string, lineTotal: string) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const qty = Math.floor(Number(line.quantity)) || 0;
        const total = Number(lineTotal) || 0;
        const unitCost = qty > 0 ? roundMoney(total / qty) : 0;
        return {
          ...line,
          lineTotal,
          unitCost: String(unitCost),
        };
      }),
    );
  }

  function removeLine(key: string) {
    const timer = priceSyncTimers.current.get(key);
    if (timer) window.clearTimeout(timer);
    priceSyncTimers.current.delete(key);
    setLines((prev) => prev.filter((line) => line.key !== key));
    qtyInputRefs.current.delete(key);
    costInputRefs.current.delete(key);
    totalInputRefs.current.delete(key);
  }

  function patchSellingPrice(
    key: string,
    field: "regularPrice" | "salePrice",
    value: string,
  ) {
    setLines((prev) =>
      prev.map((line) =>
        line.key === key ? { ...line, [field]: value, priceSeeded: true } : line,
      ),
    );
  }

  async function syncSellingPrices(line: LineDraft) {
    const regular = Number(line.regularPrice);
    const saleRaw = line.salePrice.trim();
    const sale = saleRaw === "" ? null : Number(saleRaw);

    if (!Number.isFinite(regular) || regular < 0) {
      setPriceSync((prev) => ({ ...prev, [line.key]: "error" }));
      setPriceSyncError((prev) => ({
        ...prev,
        [line.key]: "Enter a valid regular price",
      }));
      return;
    }
    if (sale != null && (!Number.isFinite(sale) || sale < 0)) {
      setPriceSync((prev) => ({ ...prev, [line.key]: "error" }));
      setPriceSyncError((prev) => ({
        ...prev,
        [line.key]: "Enter a valid sale price",
      }));
      return;
    }
    if (sale != null && sale > regular) {
      setPriceSync((prev) => ({ ...prev, [line.key]: "error" }));
      setPriceSyncError((prev) => ({
        ...prev,
        [line.key]: "Sale price must be less than or equal to the regular price",
      }));
      return;
    }

    const signature = priceSignature(line.regularPrice, line.salePrice);
    if (lastSyncedPrices.current.get(line.productId) === signature) return;

    const gen = (priceSyncGen.current.get(line.key) ?? 0) + 1;
    priceSyncGen.current.set(line.key, gen);
    setPriceSync((prev) => ({ ...prev, [line.key]: "saving" }));
    setPriceSyncError((prev) => {
      const next = { ...prev };
      delete next[line.key];
      return next;
    });

    try {
      const res = await fetch("/api/products/quick-update-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: line.productId,
          price: regular,
          salePrice: sale,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (priceSyncGen.current.get(line.key) !== gen) return;
      if (!res.ok) throw new Error(body.error ?? "Price sync failed");
      lastSyncedPrices.current.set(line.productId, signature);
      setPriceSync((prev) => ({ ...prev, [line.key]: "saved" }));
      window.setTimeout(() => {
        setPriceSync((prev) => {
          if (prev[line.key] !== "saved") return prev;
          const next = { ...prev };
          delete next[line.key];
          return next;
        });
      }, 1800);
    } catch (err) {
      if (priceSyncGen.current.get(line.key) !== gen) return;
      setPriceSync((prev) => ({ ...prev, [line.key]: "error" }));
      setPriceSyncError((prev) => ({
        ...prev,
        [line.key]: err instanceof Error ? err.message : "Price sync failed",
      }));
    }
  }

  function schedulePriceSync(line: LineDraft) {
    const existing = priceSyncTimers.current.get(line.key);
    if (existing) window.clearTimeout(existing);
    const timer = window.setTimeout(() => {
      priceSyncTimers.current.delete(line.key);
      void syncSellingPrices(line);
    }, 1000);
    priceSyncTimers.current.set(line.key, timer);
  }

  function flushPriceSync(line: LineDraft) {
    const existing = priceSyncTimers.current.get(line.key);
    if (existing) window.clearTimeout(existing);
    priceSyncTimers.current.delete(line.key);
    void syncSellingPrices(line);
  }

  function focusUnitCost(key: string) {
    const el = costInputRefs.current.get(key);
    if (!el) return;
    el.focus();
    el.select();
  }

  function focusLineTotal(key: string) {
    const el = totalInputRefs.current.get(key);
    if (!el) return;
    el.focus();
    el.select();
  }

  async function handleSearchKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    e.stopPropagation();

    const q = productQuery.trim();
    if (!q) return;

    let product = pickBestProduct(productHits, q);

    if (!product) {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/products?page=1&perPage=15&q=${encodeURIComponent(q)}`,
        );
        const body = (await res.json()) as { products?: ProductOption[] };
        product = pickBestProduct(body.products ?? [], q);
      } finally {
        setSearching(false);
      }
    }

    if (!product) {
      setError(`No product found for "${q}"`);
      return;
    }

    await addProduct(product);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessNote(null);

    if (!supplierId) {
      setError("Select a supplier");
      return;
    }
    if (lines.length === 0) {
      setError("Add at least one product line");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/purchases/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: Number(supplierId),
          invoiceNumber: invoiceNumber.trim() || null,
          date,
          paidAmount: Math.min(
            Math.max(0, Number(paidAmount) || 0),
            totalAmount,
          ),
          items: lines.map((line) => ({
            productId: line.productId,
            quantity: Math.floor(Number(line.quantity)),
            unitCost: Number(line.unitCost),
          })),
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        invoice?: { id: number };
        wooSynced?: number;
        wooError?: string | null;
        stockUpdated?: number;
      };

      if (!res.ok) throw new Error(body.error ?? "Could not save invoice");

      clearPurchaseDraft();
      allowUnloadRef.current = true;

      const note = body.wooError
        ? `Invoice saved & local stock updated (${body.stockUpdated} products). WooCommerce sync warning: ${body.wooError}`
        : `Invoice saved. Stock updated locally and on WooCommerce (${body.wooSynced} products).`;

      setSuccessNote(note);
      window.setTimeout(() => {
        router.push("/dashboard/purchases");
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard/purchases"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-200/60 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Purchases
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          New Purchase Invoice
        </h1>
        <p className="mt-1 text-slate-500">
          Scan or search a product, press Enter to add it, then enter quantity
          and cost. Receiving stock syncs to WooCommerce in one batch.
        </p>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
        <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-3">
          <label className="block sm:col-span-1">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Supplier
            </span>
            <select
              required
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">Select supplier…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {suppliers.length === 0 && (
              <Link
                href="/dashboard/suppliers"
                className="mt-1 inline-block text-xs font-medium text-brand-600 hover:underline"
              >
                Create a supplier first
              </Link>
            )}
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Invoice # (optional)
            </span>
            <input
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              placeholder="Supplier reference"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Date
            </span>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">Line items</h2>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchInputRef}
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              onKeyDown={(e) => void handleSearchKeyDown(e)}
              placeholder="Scan barcode or search name / SKU — press Enter to add"
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              autoComplete="off"
            />
            {(productHits.length > 0 || searching) && productQuery.trim() && (
              <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                {searching && productHits.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-slate-400">
                    Searching…
                  </li>
                ) : (
                  productHits.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => void addProduct(p)}
                        className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left hover:bg-brand-50"
                      >
                        <span>
                          <span className="block text-sm font-medium text-slate-900">
                            {p.name}
                          </span>
                          <span className="text-xs text-slate-500">
                            {p.barcode || p.sku || `WC #${p.wcId}`} · stock{" "}
                            {p.stockQuantity}
                          </span>
                        </span>
                        <Plus className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Product</th>
                  <th className="w-24 py-2 px-2">Qty</th>
                  <th className="w-32 py-2 px-2">
                    <span className="inline-flex items-center gap-1 text-slate-500">
                      <Wallet className="h-3.5 w-3.5" />
                      Unit cost
                    </span>
                  </th>
                  <th className="w-28 py-2 px-2">Total</th>
                  <th className="w-36 py-2 px-2">
                    <span className="inline-flex items-center gap-1 text-blue-700">
                      <Tag className="h-3.5 w-3.5" />
                      Regular price
                    </span>
                  </th>
                  <th className="w-40 py-2 px-2">
                    <span className="inline-flex items-center gap-1 text-amber-700">
                      <BadgePercent className="h-3.5 w-3.5" />
                      Sale price
                    </span>
                  </th>
                  <th className="w-28 py-2 px-2">
                    <span className="inline-flex items-center gap-1">
                      <Percent className="h-3.5 w-3.5" />
                      Margin
                    </span>
                  </th>
                  <th className="w-12 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      Scan or search and press Enter to add products
                    </td>
                  </tr>
                ) : (
                  lines.map((line) => (
                    <tr key={line.key}>
                      <td className="py-3 pr-3 font-medium text-slate-900">
                        {line.productName}
                      </td>
                      <td className="px-2 py-3">
                        <input
                          ref={(el) => {
                            if (el) qtyInputRefs.current.set(line.key, el);
                            else qtyInputRefs.current.delete(line.key);
                          }}
                          type="number"
                          min={1}
                          step={1}
                          value={line.quantity}
                          onChange={(e) =>
                            updateQuantity(line.key, e.target.value)
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              focusUnitCost(line.key);
                              return;
                            }
                            if (e.key === "Tab" && !e.shiftKey) {
                              // Let Tab move to Unit Cost (next field); select for quick edit
                              window.setTimeout(
                                () => focusUnitCost(line.key),
                                0,
                              );
                            }
                          }}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 tabular-nums outline-none focus:border-brand-500"
                        />
                      </td>
                      <td className="px-2 py-3">
                        <div className="relative">
                          <Wallet className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                          <input
                            ref={(el) => {
                              if (el) costInputRefs.current.set(line.key, el);
                              else costInputRefs.current.delete(line.key);
                            }}
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.unitCost}
                            onChange={(e) =>
                              updateUnitCost(line.key, e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                focusLineTotal(line.key);
                              }
                            }}
                            aria-label="Buying cost"
                            className="w-full rounded-lg border border-slate-200 bg-slate-100 py-1.5 pl-7 pr-2 tabular-nums text-slate-700 outline-none focus:border-slate-400 focus:bg-slate-50"
                          />
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <input
                          ref={(el) => {
                            if (el) totalInputRefs.current.set(line.key, el);
                            else totalInputRefs.current.delete(line.key);
                          }}
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.lineTotal}
                          onChange={(e) =>
                            updateLineTotal(line.key, e.target.value)
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              searchInputRef.current?.focus();
                            }
                          }}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 tabular-nums outline-none focus:border-brand-500"
                          title="Edit bulk total to reverse-calculate unit cost"
                        />
                      </td>
                      <td className="px-2 py-3">
                        <div className="relative">
                          <Tag className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-blue-500" />
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.regularPrice}
                            onChange={(e) => {
                              const regularPrice = e.target.value;
                              patchSellingPrice(line.key, "regularPrice", regularPrice);
                              schedulePriceSync({ ...line, regularPrice });
                            }}
                            onBlur={(e) =>
                              flushPriceSync({ ...line, regularPrice: e.target.value })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.preventDefault();
                            }}
                            className="w-full rounded-lg border-2 border-blue-400 bg-white py-1.5 pl-7 pr-2 tabular-nums text-blue-950 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/30"
                            aria-label="Regular selling price"
                          />
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-1.5">
                          <div className="relative min-w-0 flex-1">
                            <BadgePercent className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-amber-600" />
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={line.salePrice}
                              placeholder="—"
                              onChange={(e) => {
                                const salePrice = e.target.value;
                                patchSellingPrice(line.key, "salePrice", salePrice);
                                schedulePriceSync({ ...line, salePrice });
                              }}
                              onBlur={(e) =>
                                flushPriceSync({ ...line, salePrice: e.target.value })
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") e.preventDefault();
                              }}
                              className="w-full rounded-lg border border-amber-300 bg-amber-50 py-1.5 pl-7 pr-2 tabular-nums text-amber-950 outline-none placeholder:text-amber-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-400/40"
                              aria-label="Sale selling price"
                            />
                          </div>
                          {priceSync[line.key] === "saving" && (
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" />
                          )}
                          {priceSync[line.key] === "saved" && (
                            <Check
                              className="h-4 w-4 shrink-0 text-emerald-600"
                              aria-label="Selling price synced"
                            />
                          )}
                        </div>
                        {priceSync[line.key] === "error" && priceSyncError[line.key] && (
                          <p className="mt-1 max-w-[11rem] text-[11px] leading-snug text-red-600">
                            {priceSyncError[line.key]}
                          </p>
                        )}
                      </td>
                      <td className="px-2 py-3">
                        {(() => {
                          const margin = profitMarginPercent(
                            line.unitCost,
                            line.regularPrice,
                            line.salePrice,
                          );
                          if (margin == null) {
                            return (
                              <span className="text-sm font-bold text-slate-300">
                                —%
                              </span>
                            );
                          }
                          const positive = margin > 0;
                          return (
                            <span
                              className={
                                positive
                                  ? "text-base font-bold tabular-nums text-emerald-600"
                                  : "text-base font-bold tabular-nums text-red-600"
                              }
                            >
                              {margin.toFixed(1)}
                              <span className="ml-0.5 text-lg">%</span>
                            </span>
                          );
                        })()}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => removeLine(line.key)}
                          className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          aria-label="Remove line"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">
                Invoice total
              </span>
              <span className="text-2xl font-bold tabular-nums text-slate-900">
                {formatEGP(totalAmount)}
              </span>
            </div>

            <label className="block max-w-xs">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Amount paid now (EGP)
              </span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base font-semibold tabular-nums outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </label>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <span className="text-slate-600">
                Due / A/P increase:{" "}
                <strong className="tabular-nums text-slate-900">
                  {formatEGP(dueAmount)}
                </strong>
              </span>
              <span className="font-semibold text-slate-800">
                Status: {previewStatus}
              </span>
            </div>
          </div>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}
        {successNote && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {successNote}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Link
            href="/dashboard/purchases"
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:bg-slate-300"
          >
            {isSubmitting ? "Saving…" : "Save & Restock"}
          </button>
        </div>
      </form>
    </div>
  );
}
