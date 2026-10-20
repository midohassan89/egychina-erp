"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Search, Trash2 } from "lucide-react";
import {
  LabelPreviewCard,
  ThermalLabelSticker,
  type LabelFaceData,
} from "@/components/labels/BarcodeLabel";
import {
  getLabelTemplate,
  LABEL_TEMPLATES,
  parseLabelCopies,
  type LabelTemplateId,
} from "@/lib/labels/templates";
import { formatEGP } from "@/lib/pos/money";

interface ProductOption {
  id: string;
  name: string;
  nameZh: string | null;
  sku: string | null;
  barcode: string | null;
  price: number;
  salePrice: number | null;
}

interface LabelJob {
  key: string;
  productId: string;
  name: string;
  nameZh: string | null;
  barcode: string;
  price: number;
  /** Exact number of physical stickers — never inflated. */
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
  const [templateId, setTemplateId] = useState<LabelTemplateId>("standard-38x25");
  const [jobs, setJobs] = useState<LabelJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const template = getLabelTemplate(templateId);

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
              nameZh?: string | null;
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
              nameZh: p.nameZh ?? null,
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

  const stickers = useMemo(() => {
    const out: { key: string; data: LabelFaceData }[] = [];
    for (const job of jobs) {
      const copies = parseLabelCopies(job.copies, 1);
      for (let i = 0; i < copies; i += 1) {
        out.push({
          key: `${job.key}-${i}`,
          data: {
            name: job.name,
            nameZh: job.nameZh,
            barcode: job.barcode,
            price: job.price,
          },
        });
      }
    }
    return out;
  }, [jobs]);

  const faceCount = stickers.length * template.facesPerSticker;

  function addProduct(product: ProductOption) {
    setError(null);
    const code = (product.barcode || product.sku || "").trim();
    if (!code) {
      setError("هذا الصنف ليس له باركود أو كود للطباعة");
      return;
    }
    const copies = parseLabelCopies(copiesInput, 1);
    const price = product.salePrice != null && product.salePrice > 0
      ? product.salePrice
      : product.price;

    setJobs((prev) => {
      const existing = prev.find((j) => j.productId === product.id);
      if (existing) {
        return prev.map((j) =>
          j.productId === product.id
            ? { ...j, copies: Math.min(200, parseLabelCopies(j.copies) + copies) }
            : j,
        );
      }
      return [
        ...prev,
        {
          key: newKey(),
          productId: product.id,
          name: product.name,
          nameZh: product.nameZh,
          barcode: code,
          price,
          copies,
        },
      ];
    });
    setQuery("");
    setHits([]);
    setCopiesInput("1");
  }

  function handlePrint() {
    if (stickers.length === 0) {
      setError("أضف ملصقاً واحداً على الأقل قبل الطباعة");
      return;
    }
    setError(null);
    document.documentElement.classList.add("printing-labels");
    document.documentElement.dataset.labelTemplate = template.id;
    const cleanup = () => {
      document.documentElement.classList.remove("printing-labels");
      delete document.documentElement.dataset.labelTemplate;
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
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <ArrowLeft className="h-4 w-4" />
            رجوع
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-gray-100">
              طباعة باركود
            </h1>
            <p className="text-sm text-slate-500 dark:text-gray-400">
              اسم المنتج عربي + صيني، سعر بارز، بدون اسم الماركت — عدد الملصقات
              يطابق اختيارك حرفياً
            </p>
          </div>
          <button
            type="button"
            onClick={handlePrint}
            disabled={stickers.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:bg-slate-300"
          >
            <Printer className="h-4 w-4" />
            طباعة ({stickers.length} استيكر / {faceCount} وجه)
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-1 dark:border-gray-800 dark:bg-gray-900">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-gray-200">
              اختيار المنتج
            </h2>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-gray-400">
                قالب الملصق
              </span>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value as LabelTemplateId)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-100"
              >
                {LABEL_TEMPLATES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-gray-400">
                عدد الاستيكرات (الكمية الفعلية للطباعة)
              </span>
              <input
                type="number"
                min={1}
                max={200}
                step={1}
                value={copiesInput}
                onChange={(e) => setCopiesInput(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-100"
              />
            </label>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-gray-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (hits[0]) addProduct(hits[0]);
                  }
                }}
                placeholder="بحث بالاسم أو الباركود…"
                className="w-full rounded-xl border border-slate-200 py-2.5 pr-3 pl-10 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-100"
              />
              {(searching || hits.length > 0) && query.trim() && (
                <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900">
                  {searching && (
                    <li className="px-3 py-2 text-sm text-slate-400 dark:text-gray-500">
                      جاري البحث…
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
                          <span className="font-medium text-slate-900 dark:text-gray-100">
                            {p.name}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-gray-400">
                            {p.barcode || p.sku || "بدون باركود"} ·{" "}
                            {formatEGP(p.salePrice ?? p.price)}
                          </span>
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </div>

            {error && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </p>
            )}

            <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto">
              {jobs.length === 0 ? (
                <li className="text-sm text-slate-400 dark:text-gray-500">لا توجد ملصقات في القائمة</li>
              ) : (
                jobs.map((job) => (
                  <li
                    key={job.key}
                    className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-gray-800/60"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-gray-100">
                        {job.name}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-gray-400">
                        <label className="inline-flex items-center gap-1">
                          الكمية
                          <input
                            type="number"
                            min={1}
                            max={200}
                            value={job.copies}
                            onChange={(e) => {
                              const next = parseLabelCopies(e.target.value, 1);
                              setJobs((prev) =>
                                prev.map((row) =>
                                  row.key === job.key ? { ...row, copies: next } : row,
                                ),
                              );
                            }}
                            className="w-14 rounded border border-slate-300 px-1 py-0.5 text-center dark:border-slate-600 dark:bg-slate-900"
                          />
                        </label>
                        <span>· {job.barcode}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setJobs((prev) => prev.filter((j) => j.key !== job.key))
                      }
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:text-gray-500 dark:hover:bg-red-950/40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2 dark:border-gray-800 dark:bg-gray-900">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-gray-200">
              معاينة على الشاشة — {stickers.length} استيكر
              {template.facesPerSticker > 1
                ? ` (${faceCount} وجه لأن القالب مقسوم)`
                : ""}
            </h2>
            <div className="mt-4 flex flex-wrap gap-3">
              {stickers.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-gray-500">
                  ستظهر الملصقات هنا قبل الطباعة بنفس العدد الذي اخترته.
                </p>
              ) : (
                stickers.slice(0, 12).map((sticker) => (
                  <LabelPreviewCard
                    key={sticker.key}
                    data={sticker.data}
                    template={template}
                  />
                ))
              )}
              {stickers.length > 12 && (
                <p className="w-full text-xs text-slate-500 dark:text-gray-400">
                  +{stickers.length - 12} استيكر إضافي في قائمة الطباعة
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="thermal-label-sheet" aria-hidden>
        {stickers.map((sticker) => (
          <ThermalLabelSticker
            key={sticker.key}
            stickerKey={sticker.key}
            data={sticker.data}
            template={template}
          />
        ))}
      </div>
    </>
  );
}
