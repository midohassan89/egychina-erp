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
  Check,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { formatEGP, roundMoney } from "@/lib/pos/money";
import { QuickAddProductModal } from "@/components/dashboard/QuickAddProductModal";
import { SupplierSelect } from "@/components/dashboard/SupplierSelect";
import {
  hasCustomPackagePrice,
  PackagePriceSyncHint,
  sellingPricesDiffer,
} from "@/components/purchases/PackagePriceSyncHint";
import { PriceYieldBadges } from "@/components/purchases/PriceYield";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import {
  InvoiceMarginSelector,
  pricesFromMargin,
  SuggestPriceButton,
} from "@/components/pricing/MarginPills";
import {
  PurchaseLineProduct,
  type PurchaseProductSnapshot,
} from "@/components/purchases/PurchaseLineProduct";
import {
  fetchLinkedVirtualProducts,
  LinkedProductsPriceModal,
} from "@/components/dashboard/LinkedProductsPriceModal";

interface ProductOption {
  id: string;
  wcId: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  stockQuantity: number;
  price: number;
  salePrice: number | null;
  imageUrl?: string | null;
  purchasePackSize?: number;
  packages?: { price: number | null }[];
  /** Set when the search text is this product's carton barcode. */
  scannedPackage?: {
    barcode: string;
    name: string;
    packSize: number;
  } | null;
}

interface LineDraft {
  key: string;
  productId: string;
  productName: string;
  imageUrl: string | null;
  imageKnown: boolean;
  quantity: string;
  /** Pieces in one supplier carton. */
  packSize: string;
  /** Cost of one carton. */
  unitCost: string;
  lineTotal: string;
  regularPrice: string;
  salePrice: string;
  /** Catalog prices captured when the product was added to the invoice. */
  originalRegularPrice: string;
  originalSalePrice: string;
  hasCustomPackagePrice: boolean;
  resetPackages: boolean;
  packagesKnown: boolean;
  /** False until selling prices are loaded from the product record. */
  priceSeeded: boolean;
}

type PriceSyncState = "saving" | "saved" | "error";

function formatSaleInput(salePrice: number | null | undefined): string {
  return salePrice != null && salePrice > 0 ? String(salePrice) : "";
}


function piecesPerPack(packSize: string): number {
  const n = Math.floor(Number(packSize));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function stockPieces(line: { quantity: string; packSize: string }): number {
  const packs = Math.floor(Number(line.quantity)) || 0;
  return packs * piecesPerPack(line.packSize);
}

/** What one piece costs, from the supplier line total and pieces received. */
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

function packageSyncFromProduct(product: {
  price?: number;
  salePrice?: number | null;
  packages?: { price: number | null }[];
}) {
  const known = Array.isArray(product.packages);
  return {
    originalRegularPrice: String(product.price ?? 0),
    originalSalePrice: formatSaleInput(product.salePrice),
    hasCustomPackagePrice: known && hasCustomPackagePrice(product.packages),
    resetPackages: false,
    packagesKnown: known,
  };
}

function unknownPackageSync(regularPrice: string, salePrice: string) {
  return {
    originalRegularPrice: regularPrice,
    originalSalePrice: salePrice,
    hasCustomPackagePrice: false,
    resetPackages: false,
    packagesKnown: false,
  };
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
            imageUrl:
              typeof line.imageUrl === "string" && line.imageUrl
                ? line.imageUrl
                : null,
            imageKnown:
              line.imageKnown === true || typeof line.imageUrl === "string",
            quantity: String(line.quantity ?? "1"),
            packSize:
              typeof line.packSize === "string" && line.packSize
                ? line.packSize
                : "1",
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
            originalRegularPrice:
              typeof line.originalRegularPrice === "string"
                ? line.originalRegularPrice
                : "",
            originalSalePrice:
              typeof line.originalSalePrice === "string"
                ? line.originalSalePrice
                : "",
            hasCustomPackagePrice: line.hasCustomPackagePrice === true,
            resetPackages: line.resetPackages === true,
            packagesKnown: line.packagesKnown === true,
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

function cartonSizeFor(product: ProductOption): number {
  const scanned = Math.floor(Number(product.scannedPackage?.packSize));
  if (product.scannedPackage && Number.isFinite(scanned) && scanned >= 1) {
    return scanned;
  }
  return Math.max(1, Math.floor(Number(product.purchasePackSize)) || 1);
}

function pickBestProduct(
  products: ProductOption[],
  query: string,
): ProductOption | undefined {
  const q = query.trim().toLowerCase();
  if (!q || products.length === 0) return undefined;
  const packageHit = products.find(
    (p) => p.scannedPackage?.barcode?.toLowerCase() === q,
  );
  if (packageHit) return packageHit;
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
        <p className="text-sm text-slate-500">جاري تحميل نموذج المشتريات…</p>
      }
    >
      <ToastProvider>
        <NewPurchaseInvoicePageInner />
      </ToastProvider>
    </Suspense>
  );
}

function NewPurchaseInvoicePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paidAmount, setPaidAmount] = useState("0");
  const [globalMargin, setGlobalMargin] = useState<number | null>(20);
  const { toast } = useToast();
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [productHits, setProductHits] = useState<ProductOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [lookupQuery, setLookupQuery] = useState("");
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddQuery, setQuickAddQuery] = useState("");
  const [quickAddToast, setQuickAddToast] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [linkedPrompt, setLinkedPrompt] = useState<{
    baseProductId: string;
    baseName: string;
    regularPrice: number;
    salePrice: number | null;
  } | null>(null);
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
  const [packSync, setPackSync] = useState<Record<string, "saving" | "saved">>({});
  const [priceSyncError, setPriceSyncError] = useState<Record<string, string>>({});
  const priceSyncTimers = useRef(new Map<string, number>());
  const packSyncTimers = useRef(new Map<string, number>());
  const lastSyncedPrices = useRef(new Map<string, string>());
  const lastSyncedPackSizes = useRef(new Map<string, number>());
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
    if (!draftReady) return;
    const ids = [
      ...new Set(
        lines
          .filter((line) => !line.packagesKnown || !line.imageKnown)
          .map((line) => line.productId),
      ),
    ];
    if (ids.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/products?page=1&perPage=${ids.length}&ids=${ids.map(encodeURIComponent).join(",")}`,
        );
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { products?: ProductOption[] };
        const byId = new Map(
          (body.products ?? []).map((product) => [product.id, product]),
        );
        if (cancelled) return;
        setLines((prev) =>
          prev.map((line) => {
            if (line.packagesKnown && line.imageKnown) return line;
            const product = byId.get(line.productId);
            if (!product) {
              return { ...line, packagesKnown: true, imageKnown: true };
            }
            return {
              ...line,
              imageUrl: line.imageKnown ? line.imageUrl : (product.imageUrl ?? null),
              imageKnown: true,
              packagesKnown: true,
              hasCustomPackagePrice: line.packagesKnown
                ? line.hasCustomPackagePrice
                : hasCustomPackagePrice(product.packages),
              originalRegularPrice: line.packagesKnown
                ? line.originalRegularPrice
                : line.originalRegularPrice || String(product.price ?? 0),
              originalSalePrice: line.packagesKnown
                ? line.originalSalePrice
                : line.originalSalePrice || formatSaleInput(product.salePrice),
            };
          }),
        );
      } catch {
        // Leave the rows unmarked so a later edit can retry.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draftReady, lines]);

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
          const body = (await res.json()) as {
            products?: ProductOption[];
          };
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
    if (!quickAddToast) return;
    const timer = window.setTimeout(() => setQuickAddToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [quickAddToast]);
  useEffect(() => {
    const key = focusQtyKeyRef.current;
    if (!key) return;
    focusQtyKeyRef.current = null;
    const focus = () => {
      const el = document.getElementById(`purchase-packs-${key}`);
      if (!(el instanceof HTMLInputElement)) return;
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
  const previewStatusLabel =
    previewStatus === "PAID"
      ? "مدفوعة"
      : previewStatus === "PARTIAL"
        ? "جزئية"
        : "غير مدفوعة";

  const addProduct = useCallback(async (product: ProductOption) => {
    const lastPieceCost = await fetchLastPurchaseCost(product.id);
    const packSize = cartonSizeFor(product);
    const packCost = roundMoney(lastPieceCost * packSize);

    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        focusQtyKeyRef.current = existing.key;
        const qty = Math.max(
          1,
          (Math.floor(Number(existing.quantity)) || 0) + 1,
        );
        if (product.scannedPackage) {
          const nextPack = cartonSizeFor(product);
          const oldPack = piecesPerPack(existing.packSize);
          const piece =
            oldPack > 0 ? (Number(existing.unitCost) || 0) / oldPack : 0;
          const packCost = roundMoney(piece * nextPack);
          lastSyncedPackSizes.current.set(product.id, nextPack);
          return prev.map((l) =>
            l.productId === product.id
              ? {
                  ...l,
                  quantity: String(qty),
                  packSize: String(nextPack),
                  unitCost: String(packCost),
                  lineTotal: String(roundMoney(qty * packCost)),
                }
              : l,
          );
        }
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
      lastSyncedPackSizes.current.set(product.id, packSize);
      return [
        ...prev,
        {
          key,
          productId: product.id,
          productName: product.name,
          imageUrl: product.imageUrl ?? null,
          imageKnown: true,
          quantity: "1",
          packSize: String(packSize),
          unitCost: String(packCost),
          lineTotal: String(roundMoney(qty * packCost)),
          regularPrice: String(product.price ?? 0),
          salePrice: formatSaleInput(product.salePrice),
          ...packageSyncFromProduct(product),
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
          purchasePackSize?: number;
        };
        if (!body.productId) return;
        const pieceCost = Number(body.unitCost) || 0;
        const packSize = Math.max(1, Math.floor(Number(body.purchasePackSize)) || 1);
        const packCost = roundMoney(pieceCost * packSize);
        const regularPrice = String(body.sellPrice ?? 0);
        const salePrice = formatSaleInput(body.salePrice);
        lastSyncedPrices.current.set(
          body.productId,
          priceSignature(regularPrice, salePrice),
        );
        lastSyncedPackSizes.current.set(body.productId, packSize);
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
              imageUrl: null,
              imageKnown: false,
              quantity: "1",
              packSize: String(packSize),
              unitCost: String(packCost),
              lineTotal: String(roundMoney(1 * packCost)),
              regularPrice,
              salePrice,
              ...unknownPackageSync(regularPrice, salePrice),
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

  function updatePackSize(key: string, packSize: string) {
    setLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, packSize } : line)),
    );
  }

  async function syncPackSize(line: LineDraft, raw: string) {
    const purchasePackSize = Math.floor(Number(raw));
    if (!Number.isFinite(purchasePackSize) || purchasePackSize < 1) return;
    if (lastSyncedPackSizes.current.get(line.productId) === purchasePackSize) {
      return;
    }
    setPackSync((prev) => ({ ...prev, [line.key]: "saving" }));
    try {
      const res = await fetch("/api/products/quick-update-pack-size", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: line.productId,
          purchasePackSize,
        }),
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

  function setResetPackages(key: string, resetPackages: boolean) {
    setLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, resetPackages } : line)),
    );
  }

  function applyEditedProduct(productId: string, product: PurchaseProductSnapshot) {
    const regularPrice = String(product.price ?? 0);
    const salePrice = formatSaleInput(product.salePrice);
    lastSyncedPrices.current.set(
      productId,
      priceSignature(regularPrice, salePrice),
    );
    setLines((prev) =>
      prev.map((line) =>
        line.productId === productId
          ? {
              ...line,
              productName: product.name,
              imageUrl: product.imageUrl,
              imageKnown: true,
              regularPrice,
              salePrice,
              originalRegularPrice: regularPrice,
              originalSalePrice: salePrice,
              hasCustomPackagePrice: hasCustomPackagePrice(product.packages),
              packagesKnown: true,
              resetPackages: false,
              priceSeeded: true,
            }
          : line,
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

  function suggestSellingPrices(line: LineDraft) {
    if (globalMargin == null) {
      toast("برجاء تحديد نسبة الربح أولاً", "info");
      return;
    }
    const next = pricesFromMargin(pieceCostOf(line), globalMargin);
    if (!next) {
      toast("أدخل سعر الشراء أولاً", "info");
      return;
    }
    const regularPrice = String(next.regular);
    const salePrice = String(next.discounted);
    setLines((prev) =>
      prev.map((row) =>
        row.key === line.key
          ? { ...row, regularPrice, salePrice, priceSeeded: true }
          : row,
      ),
    );
    schedulePriceSync({ ...line, regularPrice, salePrice, priceSeeded: true });
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

  function focusPacks(key: string) {
    focusById(`purchase-packs-${key}`);
  }

  function focusPackSize(key: string) {
    focusById(`purchase-pack-size-${key}`);
  }

  function focusPackCost(key: string) {
    focusById(`purchase-pack-cost-${key}`);
  }

  function focusLineTotal(key: string) {
    focusById(`purchase-line-total-${key}`);
  }

  function focusRegularPrice(key: string) {
    focusById(`purchase-regular-price-${key}`);
  }

  function focusSalePrice(key: string) {
    focusById(`purchase-sale-price-${key}`);
  }

  function focusSearch() {
    focusById("purchase-product-search");
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
            quantity: Math.max(1, stockPieces(line)),
            unitCost: pieceCostOf(line),
            resetPackages: line.resetPackages,
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
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard/purchases"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-200/60 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          المشتريات
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          فاتورة مشتريات جديدة
        </h1>
        <p className="mt-1 text-slate-500">
          امسح أو ابحث عن منتج، اضغط Enter لإضافته، ثم أدخل الكمية والتكلفة.
          استلام المخزون يُزامن مع ووكومرس دفعة واحدة.
        </p>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
        <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-3">
          <div className="sm:col-span-1">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              المورد
            </span>
            <SupplierSelect value={supplierId} onChange={setSupplierId} />
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              رقم الفاتورة (اختياري)
            </span>
            <input
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              placeholder="مرجع المورد"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              التاريخ
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

        <InvoiceMarginSelector
          value={globalMargin}
          onChange={setGlobalMargin}
          disabled={isSubmitting}
        />

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">بنود الفاتورة</h2>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="purchase-product-search"
              ref={searchInputRef}
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              onKeyDown={(e) => void handleSearchKeyDown(e)}
              placeholder="امسح الباركود أو ابحث بالاسم / كود الصنف — اضغط Enter للإضافة"
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              autoComplete="off"
            />
            {(productQuery.trim().length > 0 &&
              (searching || lookupQuery === productQuery.trim())) && (
              <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                {searching && productHits.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-slate-400">
                    جاري البحث…
                  </li>
                ) : productHits.length === 0 ? (
                  <li className="p-2">
                    <p className="px-2 py-1.5 text-sm text-slate-500">
                      لا توجد منتجات مطابقة لـ «{productQuery.trim()}»
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setQuickAddQuery(productQuery.trim());
                        setQuickAddOpen(true);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg bg-brand-50 px-3 py-2.5 text-left text-sm font-semibold text-brand-800 hover:bg-brand-100"
                    >
                      <Plus className="h-4 w-4 shrink-0" />
                      إضافة منتج جديد
                    </button>
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
                            {p.scannedPackage
                              ? `${p.scannedPackage.name} · حجم الكرتونة ${p.scannedPackage.packSize}`
                              : `${p.barcode || p.sku || `WC #${p.wcId}`} · المخزون ${p.stockQuantity}`}
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

          <div dir="rtl" className="mt-4 max-h-[65vh] overflow-x-auto overflow-y-auto rounded-lg">
            <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
              <colgroup>
                <col className="w-14" />
                <col />
                <col className="w-20" />
                <col className="w-24" />
                <col className="w-28" />
                <col className="w-28" />
                <col className="w-24" />
                <col className="w-36" />
                <col className="w-28" />
                <col className="w-28" />
                <col className="w-10" />
              </colgroup>
              <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-20 [&_th]:bg-white [&_th]:shadow-[inset_0_-1px_0_0_#e2e8f0,0_6px_8px_-6px_rgba(15,23,42,0.18)]">
                <tr>
                  <th className="text-center align-middle whitespace-nowrap px-2 py-2 text-xs font-semibold text-gray-700">
                    صورة
                  </th>
                  <th className="text-center align-middle whitespace-nowrap px-2 py-2 text-xs font-semibold text-gray-700">
                    المنتج
                  </th>
                  <th className="text-center align-middle whitespace-nowrap px-2 py-2 text-xs font-semibold text-gray-700">
                    كراتين
                  </th>
                  <th className="text-center align-middle whitespace-nowrap px-2 py-2 text-xs font-semibold text-gray-700">
                    حجم الكرتونة
                  </th>
                  <th className="text-center align-middle whitespace-nowrap px-2 py-2 text-xs font-semibold text-gray-700">
                    تكلفة الكرتونة
                  </th>
                  <th className="text-center align-middle whitespace-nowrap px-2 py-2 text-xs font-semibold text-gray-700">
                    إجمالي البند
                  </th>
                  <th className="text-center align-middle whitespace-nowrap px-2 py-2 text-xs font-semibold text-gray-700">
                    للمخزون
                  </th>
                  <th className="text-center align-middle whitespace-nowrap px-2 py-2 text-xs font-semibold text-gray-700">
                    السعر العادي
                  </th>
                  <th className="text-center align-middle whitespace-nowrap px-2 py-2 text-xs font-semibold text-gray-700">
                    سعر التخفيض
                  </th>
                  <th className="text-center align-middle whitespace-nowrap px-2 py-2 text-xs font-semibold text-gray-700">
                    الربح / الإضافة
                  </th>
                  <th className="text-center align-middle whitespace-nowrap px-2 py-2 text-xs font-semibold text-gray-700" />
                </tr>
              </thead>
              <tbody className="[&_td]:border-b [&_td]:border-slate-100">
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-slate-400">
                      امسح أو ابحث واضغط Enter لإضافة المنتجات
                    </td>
                  </tr>
                ) : (
                  lines.map((line) => (
                    <tr key={line.key}>
                      <td className="px-1 py-2 text-center align-middle">
                        {line.imageUrl ? (
                          <img
                            src={line.imageUrl}
                            alt=""
                            className="mx-auto h-8 w-8 rounded object-cover"
                          />
                        ) : (
                          <span
                            aria-hidden
                            className="mx-auto block h-8 w-8 rounded bg-slate-100"
                          />
                        )}
                      </td>
                      <td className="overflow-hidden px-2 py-2 text-start align-middle font-medium text-slate-900">
                        <PurchaseLineProduct
                          productId={line.productId}
                          name={line.productName}
                          imageUrl={line.imageUrl}
                          showImage={false}
                          disabled={isSubmitting}
                          onUpdated={(product) =>
                            applyEditedProduct(line.productId, product)
                          }
                        />
                      </td>
                      <td className="px-2 py-2 text-center align-middle">
                        <input
                          id={`purchase-packs-${line.key}`}
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
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            if (isBlankOrOne(line.packSize)) focusPackSize(line.key);
                            else focusPackCost(line.key);
                          }}
                          aria-label="Number of cartons"
                          className="w-14 rounded-lg border border-slate-200 px-1.5 py-1.5 text-sm tabular-nums outline-none [appearance:textfield] focus:border-brand-500 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                      </td>
                      <td className="px-2 py-2 text-center align-middle">
                        <div className="flex items-center justify-center gap-1">
                          <input
                            id={`purchase-pack-size-${line.key}`}
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
                              focusPackCost(line.key);
                            }}
                            aria-label="Pieces per carton"
                            title="Pieces in one carton or box"
                            className="w-14 rounded-lg border border-slate-300 bg-slate-50 px-1.5 py-1.5 text-sm tabular-nums outline-none [appearance:textfield] focus:border-slate-500 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          />
                          {packSync[line.key] === "saving" && (
                            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-slate-400" />
                          )}
                          {packSync[line.key] === "saved" && (
                            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center align-middle">
                        <div>
                          <input
                            id={`purchase-pack-cost-${line.key}`}
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
                              if (e.key !== "Enter") return;
                              e.preventDefault();
                              focusLineTotal(line.key);
                            }}
                            aria-label="Pack cost"
                            className="w-20 rounded-lg border border-slate-200 bg-slate-100 px-1.5 py-1.5 text-sm tabular-nums text-slate-700 outline-none [appearance:textfield] focus:border-slate-400 focus:bg-slate-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          />
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center align-middle">
                        <input
                          id={`purchase-line-total-${line.key}`}
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
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            if (isBlankOrZero(line.regularPrice)) {
                              focusRegularPrice(line.key);
                            } else if (isBlankOrZero(line.salePrice)) {
                              focusSalePrice(line.key);
                            } else {
                              focusSearch();
                            }
                          }}
                          className="w-20 rounded-lg border border-slate-200 px-1.5 py-1.5 text-sm tabular-nums outline-none [appearance:textfield] focus:border-brand-500 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          title="Supplier line total. Editing it recalculates the pack cost."
                        />
                      </td>
                      <td className="px-2 py-2 text-center align-middle">
                        {(() => {
                          const pieces = stockPieces(line);
                          const pieceCost = pieceCostOf(line);
                          return (
                            <div className="leading-tight break-words">
                              <p className="font-semibold tabular-nums text-slate-900">
                                {pieces} قطعة
                              </p>
                              <p className="text-xs tabular-nums text-slate-500">
                                {formatEGP(pieceCost)} / قطعة
                              </p>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-2 py-2 text-center align-middle">
                        <div className="flex items-center justify-center gap-1">
                          <div className="relative">
                          <input
                            id={`purchase-regular-price-${line.key}`}
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
                              if (isBlankOrZero(line.salePrice)) focusSalePrice(line.key);
                              else focusSearch();
                            }}
                            className="w-20 rounded-lg border-2 border-blue-400 bg-white px-1.5 py-1.5 text-sm tabular-nums text-blue-950 outline-none [appearance:textfield] focus:border-blue-600 focus:ring-2 focus:ring-blue-500/30 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            aria-label="Regular selling price"
                          />
                          </div>
                          <SuggestPriceButton
                            disabled={isSubmitting}
                            onClick={() => suggestSellingPrices(line)}
                          />
                        </div>
                        <PackagePriceSyncHint
                          visible={
                            line.packagesKnown &&
                            line.hasCustomPackagePrice &&
                            sellingPricesDiffer(line)
                          }
                          checked={line.resetPackages}
                          disabled={isSubmitting}
                          onCheckedChange={(checked) =>
                            setResetPackages(line.key, checked)
                          }
                        />
                      </td>
                      <td className="px-2 py-2 text-center align-middle">
                        <div className="flex items-center justify-center gap-1">
                          <div className="relative">
                            <input
                              id={`purchase-sale-price-${line.key}`}
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
                                focusSearch();
                              }}
                              className="w-20 rounded-lg border border-amber-300 bg-amber-50 px-1.5 py-1.5 text-sm tabular-nums text-amber-950 outline-none [appearance:textfield] placeholder:text-amber-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-400/40 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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
                      <td className="px-1 py-2 text-center align-middle">
                        <PriceYieldBadges
                          cost={pieceCostOf(line)}
                          regularPrice={line.regularPrice}
                          salePrice={line.salePrice}
                        />
                      </td>
                      <td className="py-2 text-center align-middle">
                        <button
                          type="button"
                          onClick={() => removeLine(line.key)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
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
                إجمالي الفاتورة
              </span>
              <span className="text-2xl font-bold tabular-nums text-slate-900">
                {formatEGP(totalAmount)}
              </span>
            </div>

            <label className="block max-w-xs">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                المبلغ المدفوع الآن (ج.م)
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
                المستحق / زيادة الذمم:{" "}
                <strong className="tabular-nums text-slate-900">
                  {formatEGP(dueAmount)}
                </strong>
              </span>
              <span className="font-semibold text-slate-800">
                الحالة: {previewStatusLabel}
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
            إلغاء
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:bg-slate-300"
          >
            {isSubmitting ? "جاري الحفظ…" : "حفظ وإضافة للمخزون"}
          </button>
        </div>
      </form>

      {quickAddToast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-lg">
          {quickAddToast}
        </div>
      )}

      <QuickAddProductModal
        open={quickAddOpen}
        searchQuery={quickAddQuery}
        onClose={() => setQuickAddOpen(false)}
        onCreated={(product) => {
          setQuickAddOpen(false);
          setQuickAddToast(`${product.name} added to this invoice`);
          void addProduct(product);
        }}
      />
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
