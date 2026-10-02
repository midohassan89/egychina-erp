"use client";

import { useCallback, useEffect, useState } from "react";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { formatEGP } from "@/lib/pos/money";
import { clsx } from "clsx";

type FleetExpense = {
  id: string;
  driverId: string;
  driverName: string;
  category: string;
  amount: number;
  approvedAmount: number | null;
  status: string;
  adminNotes: string | null;
  odometerImage: string | null;
  pumpImage: string | null;
  receiptImage: string | null;
  tollImage: string | null;
  linkedExpenseId: number | null;
  createdAt: string;
};

const STATUS_FILTERS = ["PENDING", "APPROVED", "PARTIAL", "REJECTED", ""] as const;

const CATEGORY_AR: Record<string, string> = {
  FUEL: "وقود",
  TOLL: "رسوم طريق",
  OIL: "زيت",
  MAINTENANCE: "صيانة",
};

function FleetPageInner() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("PENDING");
  const [rows, setRows] = useState<FleetExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [partialOpen, setPartialOpen] = useState<FleetExpense | null>(null);
  const [partialAmount, setPartialAmount] = useState("");
  const [rejectOpen, setRejectOpen] = useState<FleetExpense | null>(null);
  const [adminNotes, setAdminNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
      const res = await fetch(`/api/admin/fleet/expenses${q}`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        error?: string;
        expenses?: FleetExpense[];
      };
      if (!res.ok) throw new Error(body.error ?? "فشل التحميل");
      setRows(body.expenses ?? []);
    } catch (err) {
      toast(err instanceof Error ? err.message : "فشل التحميل", "error");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(
    id: string,
    action: "APPROVE" | "PARTIAL" | "REJECT",
    extra?: { approvedAmount?: number; adminNotes?: string },
  ) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/fleet/expenses/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "فشل المراجعة");
      toast(
        action === "REJECT"
          ? "تم رفض المصروف"
          : "تمت الموافقة وإضافته لمصروفات الحسابات",
        "success",
      );
      setPartialOpen(null);
      setRejectOpen(null);
      setAdminNotes("");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "فشل المراجعة", "error");
    } finally {
      setBusyId(null);
    }
  }

  function photos(row: FleetExpense) {
    return [
      { label: "عداد", src: row.odometerImage },
      { label: "مضخة", src: row.pumpImage },
      { label: "إيصال", src: row.receiptImage },
      { label: "بوابة", src: row.tollImage },
    ].filter((p) => p.src);
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">أسطول السائقين</h1>
          <p className="mt-1 text-sm text-slate-500">
            مراجعة مصروفات السائقين وإضافتها للمحاسبة عند الموافقة
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s || "ALL"}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={clsx(
                "rounded-lg px-3 py-1.5 text-sm font-semibold",
                statusFilter === s
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200",
              )}
            >
              {s || "الكل"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500">جاري التحميل…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
          لا توجد مصروفات في هذا الفلتر
        </p>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <article
              key={row.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold text-slate-900">
                    {row.driverName}{" "}
                    <span className="text-sm font-medium text-slate-500">
                      · {CATEGORY_AR[row.category] ?? row.category}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    المطلوب:{" "}
                    <span className="font-bold tabular-nums">
                      {formatEGP(row.amount)}
                    </span>
                    {row.approvedAmount != null && (
                      <>
                        {" "}
                        · المعتمد:{" "}
                        <span className="font-bold tabular-nums text-emerald-700">
                          {formatEGP(row.approvedAmount)}
                        </span>
                      </>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {new Date(row.createdAt).toLocaleString("ar-EG")} ·{" "}
                    <span className="font-semibold">{row.status}</span>
                    {row.linkedExpenseId != null && (
                      <> · مصروف #{row.linkedExpenseId}</>
                    )}
                  </p>
                  {row.adminNotes && (
                    <p className="mt-2 text-sm text-slate-600">
                      ملاحظة: {row.adminNotes}
                    </p>
                  )}
                </div>

                {row.status === "PENDING" && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void review(row.id, "APPROVE")}
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      موافقة
                    </button>
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => {
                        setPartialOpen(row);
                        setPartialAmount(String(row.amount));
                        setAdminNotes("");
                      }}
                      className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50"
                    >
                      موافقة جزئية
                    </button>
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => {
                        setRejectOpen(row);
                        setAdminNotes("");
                      }}
                      className="rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      رفض
                    </button>
                  </div>
                )}
              </div>

              {photos(row).length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {photos(row).map((p) => (
                    <a
                      key={p.label}
                      href={p.src!}
                      target="_blank"
                      rel="noreferrer"
                      className="block overflow-hidden rounded-lg border border-slate-200"
                    >
                      <div className="relative aspect-[4/3] bg-slate-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.src!}
                          alt={p.label}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <p className="bg-slate-50 px-2 py-1 text-center text-xs font-semibold text-slate-600">
                        {p.label}
                      </p>
                    </a>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {partialOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-bold">موافقة جزئية</h2>
            <p className="mt-1 text-sm text-slate-500">
              المبلغ المقدَّم: {formatEGP(partialOpen.amount)}
            </p>
            <label className="mt-4 block text-sm font-semibold">
              المبلغ المعتمد
              <input
                type="number"
                min={0}
                step="0.01"
                value={partialAmount}
                onChange={(e) => setPartialAmount(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="mt-3 block text-sm font-semibold">
              ملاحظة (اختياري)
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                rows={2}
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPartialOpen(null)}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={busyId === partialOpen.id}
                onClick={() =>
                  void review(partialOpen.id, "PARTIAL", {
                    approvedAmount: Number(partialAmount),
                    adminNotes: adminNotes || undefined,
                  })
                }
                className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-bold text-white"
              >
                تأكيد
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-bold">رفض المصروف</h2>
            <label className="mt-4 block text-sm font-semibold">
              سبب الرفض
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                rows={3}
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectOpen(null)}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={busyId === rejectOpen.id}
                onClick={() =>
                  void review(rejectOpen.id, "REJECT", {
                    adminNotes: adminNotes || undefined,
                  })
                }
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white"
              >
                رفض
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FleetPage() {
  return (
    <ToastProvider>
      <FleetPageInner />
    </ToastProvider>
  );
}
