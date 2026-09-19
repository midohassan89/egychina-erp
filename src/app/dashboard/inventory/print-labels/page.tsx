"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, Printer, Search, Trash2 } from "lucide-react";
import { formatEGP } from "@/lib/pos/money";

const Barcode = dynamic(() => import("react-barcode"), { ssr: false });

const STORE_NAME = "ايجي شاينا ماركت";

interface ProductOption {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  price: number;
  salePrice: number | null;
}

interface LabelJob {
  key: string;
  productId: string;
  name: string;
  barcode: string;
  price: number;
  copies: number;
}

function newKey() {
  return `lbl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function PrintLabelsPage() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ProductOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [copiesInput, setCopiesInput] = useState("1");
  const [jobs, setJobs] = useState<LabelJob[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setHits([]);
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
            products?: {
              id: string;
              name: string;
              sku: string | null;
              barcode: string | null;
              price: number;
              salePrice: number | null;
            }[];
          };
          setHits(
            (body.products ?? []).map((p) => ({
              id: p.id,
              name: p.name,
              sku: p.sku,
              barcode: p.barcode,
              price: p.price,
              salePrice: p.salePrice,
            })),
          );
        } catch {
          setHits([]);
        } finally {
          setSearching(false);
        }
      })();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const labels = useMemo(() => {
    const out: {
      key: string;
      name: string;
      barcode: string;
      price: number;
    }[] = [];
    for (const job of jobs) {
      for (let i = 0; i < job.copies; i += 1) {
        out.push({
          key: `${job.key}-${i}`,
          name: job.name,
          barcode: job.barcode,
          price: job.price,
        });
      }
    }
    return out;
  }, [jobs]);

  function addProduct(product: ProductOption) {
    setError(null);
    const code = (product.barcode || product.sku || "").trim();
    if (!code) {
      setError("This product has no barcode or SKU to print");
      return;
    }
    const copies = Math.max(1, Math.min(200, Math.trunc(Number(copiesInput)) || 1));
    const price = product.salePrice ?? product.price;

    setJobs((prev) => {
      const existing = prev.find((j) => j.productId === product.id);
      if (existing) {
        return prev.map((j) =>
          j.productId === product.id
            ? { ...j, copies: Math.min(200, j.copies + copies) }
            : j,
        );
      }
      return [
        ...prev,
        {
          key: newKey(),
          productId: product.id,
          name: product.name,
          barcode: code,
          price,
          copies,
        },
      ];
    });
    setQuery("");
    setHits([]);
  }

  function handlePrint() {
    if (labels.length === 0) {
      setError("Add at least one label to print");
      return;
    }
    setError(null);
    document.documentElement.classList.add("printing-labels");
    const cleanup = () => {
      document.documentElement.classList.remove("printing-labels");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.setTimeout(() => window.print(), 50);
  }

  return (
    <>
      <div className="dashboard-print-hide space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/dashboard/inventory"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-slate-900">
              طباعة باركود · Print Labels
            </h1>
            <p className="text-sm text-slate-500">
              Thermal labels for Xprinter — store name, product, price, barcode
            </p>
          </div>
          <button
            type="button"
            onClick={handlePrint}
            disabled={labels.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:bg-slate-300"
          >
            <Printer className="h-4 w-4" />
            Print Labels ({labels.length})
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-1">
            <h2 className="text-sm font-semibold text-slate-800">
              Select product
            </h2>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium text-slate-500">
                Copies
              </span>
              <input
                type="number"
                min={1}
                max={200}
                value={copiesInput}
                onChange={(e) => setCopiesInput(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </label>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (hits[0]) addProduct(hits[0]);
                  }
                }}
                placeholder="Search name or barcode…"
                className="w-full rounded-xl border border-slate-200 py-2.5 pr-3 pl-10 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
              {(searching || hits.length > 0) && query.trim() && (
                <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                  {searching && (
                    <li className="px-3 py-2 text-sm text-slate-400">
                      Searching…
                    </li>
                  )}
                  {!searching &&
                    hits.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => addProduct(p)}
                          className="flex w-full flex-col px-3 py-2.5 text-left text-sm hover:bg-brand-50"
                        >
                          <span className="font-medium text-slate-900">
                            {p.name}
                          </span>
                          <span className="text-xs text-slate-500">
                            {p.barcode || p.sku || "No barcode"} ·{" "}
                            {formatEGP(p.salePrice ?? p.price)}
                          </span>
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </div>

            {error && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            )}

            <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto">
              {jobs.length === 0 ? (
                <li className="text-sm text-slate-400">No labels queued</li>
              ) : (
                jobs.map((job) => (
                  <li
                    key={job.key}
                    className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {job.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {job.copies}× · {job.barcode}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setJobs((prev) =>
                          prev.filter((j) => j.key !== job.key),
                        )
                      }
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <h2 className="text-sm font-semibold text-slate-800">
              On-screen preview
            </h2>
            <div className="mt-4 flex flex-wrap gap-3">
              {labels.length === 0 ? (
                <p className="text-sm text-slate-400">
                  Labels will appear here before printing.
                </p>
              ) : (
                labels.slice(0, 12).map((label) => (
                  <div
                    key={label.key}
                    className="thermal-label-preview flex w-[50mm] flex-col items-center rounded border border-dashed border-slate-300 bg-white px-1 py-1 text-center"
                    dir="rtl"
                  >
                    <p className="text-[9px] font-bold leading-tight">
                      {STORE_NAME}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[8px] leading-tight text-slate-800">
                      {label.name}
                    </p>
                    <p className="mt-0.5 text-[10px] font-bold tabular-nums">
                      {formatEGP(label.price)}
                    </p>
                    <div className="mt-0.5 scale-90">
                      <Barcode
                        value={label.barcode}
                        width={1.2}
                        height={28}
                        fontSize={10}
                        margin={0}
                        displayValue
                      />
                    </div>
                  </div>
                ))
              )}
              {labels.length > 12 && (
                <p className="w-full text-xs text-slate-500">
                  +{labels.length - 12} more labels in print queue
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Print-only sheet — hidden on screen via CSS */}
      <div className="thermal-label-sheet" aria-hidden>
        {labels.map((label) => (
          <div key={label.key} className="thermal-label" dir="rtl">
            <p className="label-store">{STORE_NAME}</p>
            <p className="label-name">{label.name}</p>
            <p className="label-price">{formatEGP(label.price)}</p>
            <div className="label-barcode">
              <Barcode
                value={label.barcode}
                width={1.4}
                height={36}
                fontSize={11}
                margin={2}
                displayValue
              />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
