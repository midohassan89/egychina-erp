"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Boxes, Loader2, Plus, Search, Trash2, Wallet } from "lucide-react";
import { formatEGP, roundMoney } from "@/lib/pos/money";
import { ToastProvider, useToast } from "@/components/ui/Toast";

interface ProductOption {
  id: string;
  wcId: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  stockQuantity: number;
  price?: number;
  salePrice?: number | null;
  buyingCost?: number | null;
  purchasePackSize?: number;
  linkedProductId?: string | null;
}

interface LineDraft {
  key: string;
  productId: string;
  productName: string;
  packQty: string;
  packSize: string;
  looseQty: string;
  pieceCost: string;
}

function newKey() {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const OPENING_BALANCE_DRAFT_KEY = "opening_balance_draft";

function readOpeningBalanceDraft(): { items: LineDraft[]; estimatedMargin: string } | null {
  try {
    const raw = localStorage.getItem(OPENING_BALANCE_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      items?: unknown;
      estimatedMargin?: unknown;
    };
    const items = Array.isArray(parsed.items)
      ? parsed.items
          .filter(
            (line): line is LineDraft =>
              !!line &&
              typeof line === "object" &&
              typeof (line as LineDraft).productId === "string" &&
              (line as LineDraft).productId.length > 0,
          )
          .map((line) => ({
            key: typeof line.key === "string" && line.key ? line.key : newKey(),
            productId: line.productId,
            productName: typeof line.productName === "string" ? line.productName : "",
            packQty: typeof line.packQty === "string" ? line.packQty : "0",
            packSize: typeof line.packSize === "string" ? line.packSize : "1",
            looseQty: typeof line.looseQty === "string" ? line.looseQty : "0",
            pieceCost: typeof line.pieceCost === "string" ? line.pieceCost : "0",
          }))
      : [];
    const estimatedMargin =
      typeof parsed.estimatedMargin === "string" ? parsed.estimatedMargin : "25";
    return { items, estimatedMargin };
  } catch {
    return null;
  }
}

function todayInputValue() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function piecesPerPack(packSize: string): number {
  const n = Math.floor(Number(packSize));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function totalStockOf(line: LineDraft): number {
  const packs = Math.floor(Number(line.packQty)) || 0;
  const loose = Math.floor(Number(line.looseQty)) || 0;
  return Math.max(0, packs) * piecesPerPack(line.packSize) + Math.max(0, loose);
}

function totalValueOf(line: LineDraft): number {
  const cost = Number(line.pieceCost);
  if (!Number.isFinite(cost)) return 0;
  return roundMoney(totalStockOf(line) * cost);
}

function packSizeNeedsEntry(packSize: string) {
  const trimmed = packSize.trim();
  if (!trimmed) return true;
  const n = Number(trimmed);
  return Number.isFinite(n) && n <= 1;
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

function activeSellingPrice(product: ProductOption): number {
  const sale = Number(product.salePrice);
  if (Number.isFinite(sale) && sale > 0) return sale;
  const regular = Number(product.price);
  if (Number.isFinite(regular) && regular > 0) return regular;
  return 0;
}

/** Stored buying cost, or selling price reduced by the estimated margin. */
function pieceCostForProduct(product: ProductOption, marginRaw: string): number {
  const buying = Number(product.buyingCost);
  if (Number.isFinite(buying) && buying > 0) return roundMoney(buying);

  const selling = activeSellingPrice(product);
  if (selling <= 0) return 0;

  const margin = Number(marginRaw);
  const pct = Number.isFinite(margin) ? margin : 0;
  return roundMoney(Math.max(0, selling * (1 - pct / 100)));
}

function OpeningBalanceSheet({
  mode,
  documentId,
}: {
  mode: "create" | "edit";
  documentId?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [date, setDate] = useState(todayInputValue);
  const [marginPercent, setMarginPercent] = useState("25");
  const [ready, setReady] = useState(mode === "create");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [productHits, setProductHits] = useState<ProductOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [lookupQuery, setLookupQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(mode !== "create");
  const focusQtyKeyRef = useRef<string | null>(null);
  const allowUnloadRef = useRef(false);
  const draftClearedRef = useRef(false);

  useEffect(() => {
    if (mode !== "create") return;
    const draft = readOpeningBalanceDraft();
    if (draft) {
      setLines(draft.items);
      setMarginPercent(draft.estimatedMargin);
    }
    setDraftReady(true);
  }, [mode]);

  useEffect(() => {
    if (mode !== "create" || !draftReady || draftClearedRef.current) return;
    try {
      localStorage.setItem(
        OPENING_BALANCE_DRAFT_KEY,
        JSON.stringify({ items: lines, estimatedMargin: marginPercent }),
      );
    } catch {
      // ignore quota / private-mode errors
    }
  }, [mode, draftReady, lines, marginPercent]);

  useEffect(() => {
    if (mode !== "create") return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (allowUnloadRef.current || lines.length === 0) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [mode, lines.length]);

  useEffect(() => {
    if (mode !== "edit" || !documentId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/opening-balances/${documentId}`);
        const body = (await res.json()) as {
          error?: string;
          date?: string;
          notes?: string;
          items?: {
            id: number;
            productId: string;
            productName: string;
            packQty: number;
            packSize: number;
            looseQty: number;
            pieceCost: number;
          }[];
        };
        if (cancelled) return;
        if (!res.ok) {
          setError(body.error ?? "Could not load this opening balance");
          setReady(true);
          return;
        }
        setDate(body.date ?? todayInputValue());
        setNotes(body.notes ?? "");
        setLines(
          (body.items ?? []).map((item) => ({
            key: `saved-${item.id}`,
            productId: item.productId,
            productName: item.productName,
            packQty: String(item.packQty),
            packSize: String(item.packSize),
            looseQty: String(item.looseQty),
            pieceCost: String(item.pieceCost),
          })),
        );
      } catch {
        if (!cancelled) setError("Could not load this opening balance");
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, documentId]);

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
      const el = document.getElementById(`opening-pack-qty-${key}`);
      if (!(el instanceof HTMLInputElement)) return;
      el.focus();
      el.select();
    });
  }, [lines]);

  const sheetTotal = useMemo(
    () => roundMoney(lines.reduce((sum, line) => sum + totalValueOf(line), 0)),
    [lines],
  );

  const addProduct = useCallback(async (product: ProductOption) => {
    if (product.linkedProductId) {
      setError(`${product.name} is a virtual bundle and does not hold stock`);
      return;
    }
    const pieceCost = pieceCostForProduct(product, marginPercent);
    const packSize = Math.max(1, Math.floor(Number(product.purchasePackSize)) || 1);

    setLines((prev) => {
      const existing = prev.find((line) => line.productId === product.id);
      if (existing) {
        focusQtyKeyRef.current = existing.key;
        const qty = Math.max(1, (Math.floor(Number(existing.packQty)) || 0) + 1);
        return prev.map((line) =>
          line.productId === product.id ? { ...line, packQty: String(qty) } : line,
        );
      }
      const key = newKey();
      focusQtyKeyRef.current = key;
      return [
        ...prev,
        {
          key,
          productId: product.id,
          productName: product.name,
          packQty: "1",
          packSize: String(packSize),
          looseQty: "0",
          pieceCost: String(pieceCost),
        },
      ];
    });
    setProductQuery("");
    setProductHits([]);
    setError(null);
  }, [marginPercent]);

  function focusById(id: string) {
    window.requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (!(el instanceof HTMLInputElement)) return;
      el.focus();
      el.select();
    });
  }

  function patchLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  async function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
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
      setError(`No product matches “${q}”`);
      return;
    }
    await addProduct(product);
  }

  function payloadItems() {
    return lines.map((line) => ({
      productId: line.productId,
      packQty: Math.floor(Number(line.packQty)) || 0,
      packSize: piecesPerPack(line.packSize),
      looseQty: Math.floor(Number(line.looseQty)) || 0,
      pieceCost: Number(line.pieceCost) || 0,
    }));
  }

  async function save() {
    if (mode === "create" && lines.length === 0) {
      setError("Add at least one product");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        mode === "edit"
          ? `/api/opening-balances/${documentId}`
          : "/api/inventory/opening-balance",
        {
          method: mode === "edit" ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date,
            notes,
            items: payloadItems(),
          }),
        },
      );
      const body = (await res.json()) as {
        id?: number;
        error?: string;
        wooError?: string | null;
      };
      if (!res.ok) {
        setError(body.error ?? "Could not save the opening balance");
        return;
      }
      if (body.wooError) {
        toast(`WooCommerce sync failed: ${body.wooError}`, "error");
      }
      if (mode === "edit") {
        toast("Opening balance updated", "success");
        return;
      }
      draftClearedRef.current = true;
      allowUnloadRef.current = true;
      try {
        localStorage.removeItem(OPENING_BALANCE_DRAFT_KEY);
      } catch {
        // ignore private-mode errors
      }
      router.push(`/dashboard/inventory/opening-balance/${body.id}/edit`);
    } catch {
      setError("Could not save the opening balance");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link
            href="/dashboard/inventory"
            className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Inventory
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">
            {mode === "edit" ? `Opening Balance #${documentId}` : "Opening Balance"}
          </h1>
          <p className="mt-1 text-slate-500">
            {mode === "edit"
              ? "أرصدة أول المدة — stock changes by the difference from the saved quantities"
              : "أرصدة أول المدة — adds these pieces to current stock and sets the piece cost"}
          </p>
        </div>
      </div>

      {!ready ? (
        <p className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-400">
          Loading opening balance…
        </p>
      ) : (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Estimated Margin % for Missing Costs
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={marginPercent}
              onChange={(e) => setMarginPercent(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm tabular-nums outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Notes</span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
        </div>

        <div className="relative mt-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            id="opening-product-search"
            value={productQuery}
            onChange={(e) => setProductQuery(e.target.value)}
            onKeyDown={(e) => void handleSearchKeyDown(e)}
            placeholder="Scan barcode or search name / SKU — press Enter to add"
            className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            autoComplete="off"
          />
          {productQuery.trim().length > 0 &&
            (searching || lookupQuery === productQuery.trim()) && (
              <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                {searching && productHits.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-slate-400">Searching…</li>
                ) : productHits.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-slate-500">
                    No products match “{productQuery.trim()}”
                  </li>
                ) : (
                  productHits.map((product) => (
                    <li key={product.id}>
                      <button
                        type="button"
                        onClick={() => void addProduct(product)}
                        className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left hover:bg-brand-50"
                      >
                        <span>
                          <span className="block text-sm font-medium text-slate-900">
                            {product.name}
                          </span>
                          <span className="text-xs text-slate-500">
                            {product.barcode || product.sku || `WC #${product.wcId}`} · stock{" "}
                            {product.stockQuantity}
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
                <th className="w-28 py-2 px-2">Pack qty (كراتين)</th>
                <th className="w-28 py-2 px-2">
                  <span className="inline-flex items-center gap-1 text-slate-600">
                    <Boxes className="h-3.5 w-3.5" />
                    Pack size
                  </span>
                </th>
                <th className="w-28 py-2 px-2 text-violet-700">Loose qty (فرط)</th>
                <th className="w-36 py-2 px-2">
                  <span className="inline-flex items-center gap-1 text-slate-500">
                    <Wallet className="h-3.5 w-3.5" />
                    Piece cost
                  </span>
                </th>
                <th className="w-36 py-2 px-2">Total value</th>
                <th className="w-12 py-2" />
              </tr>
            </thead>
            <tbody className="[&_td]:border-b [&_td]:border-slate-100">
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Scan or search and press Enter to add products
                  </td>
                </tr>
              ) : (
                lines.map((line) => {
                  const stock = totalStockOf(line);
                  return (
                    <tr key={line.key}>
                      <td className="py-3 pr-3">
                        <p className="font-medium text-slate-900">{line.productName}</p>
                        <p className="text-xs text-slate-500">{stock} pcs to stock</p>
                      </td>
                      <td className="px-2 py-3">
                        <input
                          id={`opening-pack-qty-${line.key}`}
                          type="number"
                          min={0}
                          step={1}
                          value={line.packQty}
                          onChange={(e) => patchLine(line.key, { packQty: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            focusById(`opening-loose-${line.key}`);
                          }}
                          aria-label="Pack quantity"
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 tabular-nums outline-none focus:border-brand-500"
                        />
                      </td>
                      <td className="px-2 py-3">
                        <input
                          id={`opening-pack-size-${line.key}`}
                          type="number"
                          min={1}
                          step={1}
                          value={line.packSize}
                          onChange={(e) => patchLine(line.key, { packSize: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            focusById(`opening-piece-cost-${line.key}`);
                          }}
                          aria-label="Pack size"
                          className="w-full rounded-lg border border-slate-300 bg-slate-50 px-2 py-1.5 tabular-nums outline-none focus:border-slate-500"
                        />
                      </td>
                      <td className="px-2 py-3">
                        <input
                          id={`opening-loose-${line.key}`}
                          type="number"
                          min={0}
                          step={1}
                          value={line.looseQty}
                          onChange={(e) => patchLine(line.key, { looseQty: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            if (packSizeNeedsEntry(line.packSize)) {
                              focusById(`opening-pack-size-${line.key}`);
                            } else {
                              focusById(`opening-piece-cost-${line.key}`);
                            }
                          }}
                          aria-label="Loose quantity"
                          className="w-full rounded-lg border border-violet-200 bg-violet-50 px-2 py-1.5 tabular-nums text-violet-950 outline-none focus:border-violet-500"
                        />
                      </td>
                      <td className="px-2 py-3">
                        <div className="relative">
                          <Wallet className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                          <input
                            id={`opening-piece-cost-${line.key}`}
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.pieceCost}
                            onChange={(e) => patchLine(line.key, { pieceCost: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key !== "Enter") return;
                              e.preventDefault();
                              focusById("opening-product-search");
                            }}
                            aria-label="Piece cost"
                            className="w-full rounded-lg border border-slate-200 bg-slate-100 py-1.5 pl-7 pr-2 tabular-nums text-slate-700 outline-none focus:border-slate-400 focus:bg-slate-50"
                          />
                        </div>
                      </td>
                      <td className="px-2 py-3 font-semibold tabular-nums text-slate-900">
                        {formatEGP(totalValueOf(line))}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setLines((prev) => prev.filter((row) => row.key !== line.key))
                          }
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          aria-label="Remove line"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            Sheet total{" "}
            <span className="font-semibold text-slate-900">{formatEGP(sheetTotal)}</span>
          </p>
          <button
            type="submit"
            disabled={isSubmitting || !ready || (mode === "create" && lines.length === 0)}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "edit" ? "Update (تحديث)" : "Save opening balance"}
          </button>
        </div>
      </form>
      )}
    </div>
  );
}

export function OpeningBalanceCreate() {
  return (
    <ToastProvider>
      <OpeningBalanceSheet mode="create" />
    </ToastProvider>
  );
}

export function OpeningBalanceEditor({ documentId }: { documentId: string }) {
  return (
    <ToastProvider>
      <OpeningBalanceSheet mode="edit" documentId={documentId} />
    </ToastProvider>
  );
}
