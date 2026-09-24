"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BadgePercent,
  Boxes,
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
import {
  fetchLinkedVirtualProducts,
  LinkedProductsPriceModal,
} from "@/components/dashboard/LinkedProductsPriceModal";

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
  purchasePackSize?: number;
}

interface LineDraft {
  key: string;
  productId: string;
  productName: string;
  quantity: string;
  packSize: string;
  unitCost: string;
  lineTotal: string;
  regularPrice: string;
  salePrice: string;
  priceSeeded: boolean;
}

interface StoredInvoiceItem {
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
  lineTotal?: number;
  price?: number;
  salePrice?: number | null;
  purchasePackSize?: number;
}

type PriceSyncState = "saving" | "saved" | "error";

function newKey() {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatSaleInput(salePrice: number | null | undefined): string {
  return salePrice != null && salePrice > 0 ? String(salePrice) : "";
}

function priceSignature(regularPrice: string, salePrice: string): string {
  const regular = Number(regularPrice);
  const saleRaw = salePrice.trim();
  const sale = saleRaw === "" ? "" : String(Number(saleRaw));
  return `${Number.isFinite(regular) ? regular : ""}|${sale}`;
}

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

function piecesPerPack(packSize: string): number {
  const n = Math.floor(Number(packSize));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function stockPieces(line: { quantity: string; packSize: string }): number {
  const packs = Math.floor(Number(line.quantity)) || 0;
  return packs * piecesPerPack(line.packSize);
}

function pieceCostOf(line: {
  quantity: string;
  packSize: string;
  lineTotal: string;
}): number {
  const pieces = stockPieces(line);
  const total = Number(line.lineTotal);
  if (pieces <= 0 || !Number.isFinite(total)) return 0;
  return total / pieces;
}

function isBlankOrOne(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return true;
  const n = Number(trimmed);
  return Number.isFinite(n) && n === 1;
}

function isBlankOrZero(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return true;
  const n = Number(trimmed);
  return Number.isFinite(n) && n === 0;
}

/** Stored invoice lines are pieces and piece cost. Show them as packs when the carton size divides evenly. */
function lineFromStoredItem(item: StoredInvoiceItem): LineDraft {
  const pieces = Math.max(0, Math.floor(Number(item.quantity)) || 0);
  const remembered = Math.max(1, Math.floor(Number(item.purchasePackSize)) || 1);
  const packSize =
    remembered > 1 && pieces > 0 && pieces % remembered === 0 ? remembered : 1;
  const packs = pieces > 0 ? pieces / packSize : 1;
  const lineTotal = Number.isFinite(Number(item.lineTotal))
    ? Number(item.lineTotal)
    : roundMoney(pieces * (Number(item.unitCost) || 0));
  const packCost = packs > 0 ? roundMoney(lineTotal / packs) : 0;
  return {
    key: newKey(),
    productId: item.productId,
    productName: item.productName,
    quantity: String(packs),
    packSize: String(packSize),
    unitCost: String(packCost),
    lineTotal: String(roundMoney(lineTotal)),
    regularPrice: String(item.price ?? 0),
    salePrice: formatSaleInput(item.salePrice),
    priceSeeded: true,
  };
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

export default function EditPurchaseInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idParam } = use(params);
  const invoiceId = Number(idParam);
  const router = useRouter();

  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [date, setDate] = useState("");
  const [paidAmount, setPaidAmount] = useState("0");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [productHits, setProductHits] = useState<ProductOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [lookupQuery, setLookupQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [linkedPrompt, setLinkedPrompt] = useState<{
    baseProductId: string;
    baseName: string;
    regularPrice: number;
    salePrice: number | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successNote, setSuccessNote] = useState<string | null>(null);
  const [priceSync, setPriceSync] = useState<Record<string, PriceSyncState>>({});
  const [priceSyncError, setPriceSyncError] = useState<Record<string, string>>({});
  const [packSync, setPackSync] = useState<Record<string, "saving" | "saved">>({});

  const focusQtyKeyRef = useRef<string | null>(null);
  const priceSyncTimers = useRef(new Map<string, number>());
  const packSyncTimers = useRef(new Map<string, number>());
  const lastSyncedPrices = useRef(new Map<string, string>());
  const lastSyncedPackSizes = useRef(new Map<string, number>());
  const priceSyncGen = useRef(new Map<string, number>());

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/suppliers");
      if (!res.ok) return;
      const body = (await res.json()) as { suppliers?: SupplierOption[] };
      setSuppliers(body.suppliers ?? []);
    })();
  }, []);

  useEffect(() => {
    if (!Number.isFinite(invoiceId) || invoiceId <= 0) {
      setError("Invalid invoice id");
      setIsLoading(false);
      return;
    }

    void (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/purchases/${invoiceId}`);
        const body = (await res.json()) as {
          error?: string;
          invoice?: {
            id: number;
            invoiceNumber: string | null;
            date: string;
            supplierId: number;
            paidAmount: number;
            items: StoredInvoiceItem[];
          };
        };
        if (!res.ok || !body.invoice) {
          throw new Error(body.error ?? "Failed to load invoice");
        }
        const inv = body.invoice;
        const nextLines = inv.items.map(lineFromStoredItem);
        for (const line of nextLines) {
          lastSyncedPrices.current.set(
            line.productId,
            priceSignature(line.regularPrice, line.salePrice),
          );
          lastSyncedPackSizes.current.set(
            line.productId,
            piecesPerPack(line.packSize),
          );
        }
        setSupplierId(String(inv.supplierId));
        setInvoiceNumber(inv.invoiceNumber ?? "");
        setDate(new Date(inv.date).toISOString().slice(0, 10));
        setPaidAmount(String(inv.paidAmount));
        setLines(nextLines);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [invoiceId]);

  useEffect(() => {
    const q = productQuery.trim();
    if (q.length < 1) {
      setProductHits([]);
      setLookupQuery("");
      return;
    }
    setLookupQuery("");
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setSearching(true);
        try {
          const res = await fetch(
            `/api/products?page=1&perPage=15&q=${encodeURIComponent(q)}`,
          );
          const body = (await res.json()) as { products?: ProductOption[] };
          if (cancelled) return;
          setProductHits(body.products ?? []);
        } finally {
          if (!cancelled) {
            setSearching(false);
            setLookupQuery(q);
          }
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [productQuery]);

  useEffect(() => {
    const key = focusQtyKeyRef.current;
    if (!key) return;
    focusQtyKeyRef.current = null;
    window.requestAnimationFrame(() => {
      const el = document.getElementById(`edit-purchase-packs-${key}`);
      if (!(el instanceof HTMLInputElement)) return;
      el.focus();
      el.select();
    });
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
    const lastPieceCost = await fetchLastPurchaseCost(product.id);
    const packSize = Math.max(1, Math.floor(Number(product.purchasePackSize)) || 1);
    const packCost = roundMoney(lastPieceCost * packSize);

    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        focusQtyKeyRef.current = existing.key;
        const qty = Math.max(1, (Math.floor(Number(existing.quantity)) || 0) + 1);
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
      lastSyncedPrices.current.set(
        product.id,
        priceSignature(String(product.price ?? 0), formatSaleInput(product.salePrice)),
      );
      lastSyncedPackSizes.current.set(product.id, packSize);
      return [
        ...prev,
        {
          key,
          productId: product.id,
          productName: product.name,
          quantity: "1",
          packSize: String(packSize),
          unitCost: String(packCost),
          lineTotal: String(roundMoney(packCost)),
          regularPrice: String(product.price ?? 0),
          salePrice: formatSaleInput(product.salePrice),
          priceSeeded: true,
        },
      ];
    });
    setProductQuery("");
    setProductHits([]);
    setLookupQuery("");
    setError(null);
  }, []);

  function updateQuantity(key: string, quantity: string) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const qty = Math.floor(Number(quantity)) || 0;
        const cost = Number(line.unitCost) || 0;
        return { ...line, quantity, lineTotal: String(roundMoney(qty * cost)) };
      }),
    );
  }

  function updatePackSize(key: string, packSize: string) {
    setLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, packSize } : line)),
    );
  }

  function updateUnitCost(key: string, unitCost: string) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const qty = Math.floor(Number(line.quantity)) || 0;
        const cost = Number(unitCost) || 0;
        return { ...line, unitCost, lineTotal: String(roundMoney(qty * cost)) };
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
        return { ...line, lineTotal, unitCost: String(unitCost) };
      }),
    );
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

  function removeLine(key: string) {
    const priceTimer = priceSyncTimers.current.get(key);
    if (priceTimer) window.clearTimeout(priceTimer);
    const packTimer = packSyncTimers.current.get(key);
    if (packTimer) window.clearTimeout(packTimer);
    setLines((prev) => prev.filter((line) => line.key !== key));
  }

  async function syncPackSize(line: LineDraft, raw: string) {
    const purchasePackSize = Math.floor(Number(raw));
    if (!Number.isFinite(purchasePackSize) || purchasePackSize < 1) return;
    if (lastSyncedPackSizes.current.get(line.productId) === purchasePackSize) return;
    setPackSync((prev) => ({ ...prev, [line.key]: "saving" }));
    try {
      const res = await fetch("/api/products/quick-update-pack-size", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: line.productId, purchasePackSize }),
      });
      if (!res.ok) return;
      lastSyncedPackSizes.current.set(line.productId, purchasePackSize);
      setPackSync((prev) => ({ ...prev, [line.key]: "saved" }));
      window.setTimeout(() => {
        setPackSync((prev) => {
          if (prev[line.key] !== "saved") return prev;
          const next = { ...prev };
          delete next[line.key];
          return next;
        });
      }, 1600);
    } catch {
      setPackSync((prev) => {
        const next = { ...prev };
        delete next[line.key];
        return next;
      });
    }
  }

  function schedulePackSync(line: LineDraft, packSize: string) {
    const existing = packSyncTimers.current.get(line.key);
    if (existing) window.clearTimeout(existing);
    const timer = window.setTimeout(() => {
      packSyncTimers.current.delete(line.key);
      void syncPackSize(line, packSize);
    }, 600);
    packSyncTimers.current.set(line.key, timer);
  }

  function flushPackSync(line: LineDraft, packSize: string) {
    const existing = packSyncTimers.current.get(line.key);
    if (existing) window.clearTimeout(existing);
    packSyncTimers.current.delete(line.key);
    const normalized = String(piecesPerPack(packSize));
    if (normalized !== packSize) updatePackSize(line.key, normalized);
    void syncPackSize({ ...line, packSize: normalized }, normalized);
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
      const linked = await fetchLinkedVirtualProducts(line.productId);
      if (priceSyncGen.current.get(line.key) !== gen) return;
      if (linked.length > 0) {
        setLinkedPrompt({
          baseProductId: line.productId,
          baseName: line.productName,
          regularPrice: regular,
          salePrice: sale != null && sale > 0 ? sale : null,
        });
      }
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

  function focusById(id: string) {
    window.requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (!(el instanceof HTMLInputElement)) return;
      el.focus();
      el.select();
    });
  }

  async function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
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
      const res = await fetch(`/api/purchases/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: Number(supplierId),
          invoiceNumber: invoiceNumber.trim() || null,
          date,
          paidAmount: Math.min(Math.max(0, Number(paidAmount) || 0), totalAmount),
          items: lines.map((line) => ({
            productId: line.productId,
            quantity: Math.max(1, stockPieces(line)),
            unitCost: pieceCostOf(line),
          })),
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        message?: string;
        wooError?: string | null;
        stockUpdated?: number;
      };
      if (!res.ok) throw new Error(body.error ?? "Could not update invoice");
      setSuccessNote(
        body.message ??
          `Invoice updated. Stock adjusted for ${body.stockUpdated ?? 0} products.`,
      );
      window.setTimeout(() => {
        router.push("/dashboard/purchases");
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <p className="py-12 text-center text-sm text-slate-500">
        Loading invoice…
      </p>
    );
  }

  const query = productQuery.trim();
  const showProductMenu = query.length > 0 && (searching || lookupQuery === query);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
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
          تعديل فاتورة مشتريات
        </h1>
        <p className="mt-1 text-slate-500">
          Edit Purchase Order #{invoiceId}. Stock quantities are adjusted by the
          difference between old and new line quantities (Admin only).
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
              id="edit-purchase-product-search"
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              onKeyDown={(e) => void handleSearchKeyDown(e)}
              placeholder="Scan barcode or search name / SKU — press Enter to add"
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              autoComplete="off"
            />
            {showProductMenu && (
              <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                {searching && productHits.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-slate-400">Searching…</li>
                ) : productHits.length === 0 ? (
                  <li className="px-3 py-2.5 text-sm text-slate-500">
                    No products match “{query}”
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

          <div className="mt-4 max-h-[65vh] overflow-auto rounded-lg">
            <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
              <thead className="text-xs font-semibold uppercase tracking-wide text-slate-500 [&_th]:sticky [&_th]:top-0 [&_th]:z-20 [&_th]:bg-white [&_th]:shadow-[inset_0_-1px_0_0_#e2e8f0,0_6px_8px_-6px_rgba(15,23,42,0.18)]">
                <tr>
                  <th className="py-2 pr-3">Product</th>
                  <th className="w-24 py-2 px-2">Packs</th>
                  <th className="w-28 py-2 px-2">
                    <span className="inline-flex items-center gap-1 text-slate-600">
                      <Boxes className="h-3.5 w-3.5" />
                      Pack size
                    </span>
                  </th>
                  <th className="w-32 py-2 px-2">
                    <span className="inline-flex items-center gap-1 text-slate-500">
                      <Wallet className="h-3.5 w-3.5" />
                      Pack cost
                    </span>
                  </th>
                  <th className="w-28 py-2 px-2">Line total</th>
                  <th className="w-36 py-2 px-2">To stock</th>
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
              <tbody className="[&_td]:border-b [&_td]:border-slate-100">
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-400">
                      Search and add products above
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
                          id={`edit-purchase-packs-${line.key}`}
                          type="number"
                          min={1}
                          step={1}
                          value={line.quantity}
                          onChange={(e) => updateQuantity(line.key, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            if (isBlankOrOne(line.packSize)) {
                              focusById(`edit-purchase-pack-size-${line.key}`);
                            } else {
                              focusById(`edit-purchase-pack-cost-${line.key}`);
                            }
                          }}
                          aria-label="Number of cartons"
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 tabular-nums outline-none focus:border-brand-500"
                        />
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-1">
                          <input
                            id={`edit-purchase-pack-size-${line.key}`}
                            type="number"
                            min={1}
                            step={1}
                            value={line.packSize}
                            onChange={(e) => {
                              const packSize = e.target.value;
                              updatePackSize(line.key, packSize);
                              schedulePackSync(line, packSize);
                            }}
                            onBlur={(e) => flushPackSync(line, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key !== "Enter") return;
                              e.preventDefault();
                              focusById(`edit-purchase-pack-cost-${line.key}`);
                            }}
                            aria-label="Pieces per carton"
                            className="w-full rounded-lg border border-slate-300 bg-slate-50 px-2 py-1.5 tabular-nums outline-none focus:border-slate-500"
                          />
                          {packSync[line.key] === "saving" && (
                            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-slate-400" />
                          )}
                          {packSync[line.key] === "saved" && (
                            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <div className="relative">
                          <Wallet className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                          <input
                            id={`edit-purchase-pack-cost-${line.key}`}
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.unitCost}
                            onChange={(e) => updateUnitCost(line.key, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key !== "Enter") return;
                              e.preventDefault();
                              focusById(`edit-purchase-line-total-${line.key}`);
                            }}
                            aria-label="Pack cost"
                            className="w-full rounded-lg border border-slate-200 bg-slate-100 py-1.5 pl-7 pr-2 tabular-nums text-slate-700 outline-none focus:border-slate-400 focus:bg-slate-50"
                          />
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <input
                          id={`edit-purchase-line-total-${line.key}`}
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.lineTotal}
                          onChange={(e) => updateLineTotal(line.key, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            if (isBlankOrZero(line.regularPrice)) {
                              focusById(`edit-purchase-regular-price-${line.key}`);
                            } else if (isBlankOrZero(line.salePrice)) {
                              focusById(`edit-purchase-sale-price-${line.key}`);
                            } else {
                              focusById("edit-purchase-product-search");
                            }
                          }}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 tabular-nums outline-none focus:border-brand-500"
                          title="Supplier line total. Editing it recalculates the pack cost."
                        />
                      </td>
                      <td className="px-2 py-3">
                        <div className="leading-tight">
                          <p className="font-semibold tabular-nums text-slate-900">
                            {stockPieces(line)} pcs
                          </p>
                          <p className="text-xs tabular-nums text-slate-500">
                            {formatEGP(pieceCostOf(line))} / pc
                          </p>
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <div className="relative">
                          <Tag className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-blue-500" />
                          <input
                            id={`edit-purchase-regular-price-${line.key}`}
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
                              if (e.key !== "Enter") return;
                              e.preventDefault();
                              if (isBlankOrZero(line.salePrice)) {
                                focusById(`edit-purchase-sale-price-${line.key}`);
                              } else {
                                focusById("edit-purchase-product-search");
                              }
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
                              id={`edit-purchase-sale-price-${line.key}`}
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
                                if (e.key !== "Enter") return;
                                e.preventDefault();
                                focusById("edit-purchase-product-search");
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
                            String(pieceCostOf(line)),
                            line.regularPrice,
                            line.salePrice,
                          );
                          if (margin == null) {
                            return (
                              <span className="text-sm font-bold text-slate-300">—%</span>
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
                Amount paid (EGP)
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
                Due / A/P:{" "}
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
            {isSubmitting ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
      {linkedPrompt && (
        <LinkedProductsPriceModal
          open
          baseProductId={linkedPrompt.baseProductId}
          baseProductName={linkedPrompt.baseName}
          regularPrice={linkedPrompt.regularPrice}
          salePrice={linkedPrompt.salePrice}
          onClose={() => setLinkedPrompt(null)}
        />
      )}
    </div>
  );
}
