"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { clsx } from "clsx";
import { ShoppingCart } from "lucide-react";
import { formatEGP } from "@/lib/pos/money";

interface Kpis {
  totalRevenue: number;
  cogs: number;
  grossProfit: number;
  totalExpenses: number;
  netProfit: number;
}

interface DailyPoint {
  date: string;
  revenue: number;
}

interface TopSeller {
  name: string;
  quantitySold: number;
}

interface LowStockRow {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  stockQuantity: number;
}

interface InventoryValuation {
  totalAssetValue: number;
  expectedRetailValue: number;
  potentialGrossMargin: number;
  marginPercent: number;
}

function defaultMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function shortDate(isoDate: string) {
  const d = new Date(isoDate + "T12:00:00");
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export default function ReportsPage() {
  const defaults = useMemo(() => defaultMonthRange(), []);
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [dailyRevenue, setDailyRevenue] = useState<DailyPoint[]>([]);
  const [topSellers, setTopSellers] = useState<TopSeller[]>([]);
  const [lowStock, setLowStock] = useState<LowStockRow[]>([]);
  const [inventory, setInventory] = useState<InventoryValuation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const q = `startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
      const [sumRes, prodRes, invRes] = await Promise.all([
        fetch(`/api/reports/summary?${q}`),
        fetch(`/api/reports/products?${q}`),
        fetch("/api/reports/inventory-valuation"),
      ]);
      const sumBody = (await sumRes.json()) as {
        error?: string;
        kpis?: Kpis;
        dailyRevenue?: DailyPoint[];
      };
      const prodBody = (await prodRes.json()) as {
        error?: string;
        topSellers?: TopSeller[];
        lowStock?: LowStockRow[];
      };
      const invBody = (await invRes.json()) as {
        error?: string;
        summary?: InventoryValuation;
      };
      if (!sumRes.ok) throw new Error(sumBody.error ?? "Failed to load summary");
      if (!prodRes.ok) throw new Error(prodBody.error ?? "Failed to load products");
      if (!invRes.ok)
        throw new Error(invBody.error ?? "Failed to load inventory valuation");

      setKpis(sumBody.kpis ?? null);
      setDailyRevenue(sumBody.dailyRevenue ?? []);
      setTopSellers(prodBody.topSellers ?? []);
      setLowStock(prodBody.lowStock ?? []);
      setInventory(invBody.summary ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reports");
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartDaily = useMemo(
    () =>
      dailyRevenue.map((d) => ({
        ...d,
        label: shortDate(d.date),
      })),
    [dailyRevenue],
  );

  const chartSellers = useMemo(
    () =>
      topSellers.map((s) => ({
        name:
          s.name.length > 18 ? `${s.name.slice(0, 16)}…` : s.name,
        fullName: s.name,
        qty: s.quantitySold,
      })),
    [topSellers],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="text-right">
          <h1 className="text-2xl font-bold text-slate-900">
            التقارير والتحليلات
          </h1>
          <p className="mt-1 text-slate-500">
            الأرباح والخسائر، الأكثر مبيعاً، وتنبيهات النواقص
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold tracking-wide text-slate-500">
              من
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold tracking-wide text-slate-500">
              إلى
            </span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            تحديث
          </button>
          <Link
            href="/dashboard/reports/supplier-statement"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            كشف حساب مورد
          </Link>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="إجمالي الإيرادات"
          value={kpis?.totalRevenue}
          loading={isLoading}
          tone="neutral"
        />
        <KpiCard
          label="إجمالي الربح"
          value={kpis?.grossProfit}
          loading={isLoading}
          tone="auto"
        />
        <KpiCard
          label="إجمالي المصروفات"
          value={kpis?.totalExpenses}
          loading={isLoading}
          tone="expense"
        />
        <KpiCard
          label="صافي الربح"
          value={kpis?.netProfit}
          loading={isLoading}
          tone="auto"
        />
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div className="text-right">
            <h2 className="text-sm font-semibold text-slate-800">
              تقييم المخزون
            </h2>
            <p className="text-xs text-slate-500">
              تكلفة الأصول مقابل قيمة البيع المتوقعة
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard
            label="تكلفة المخزون (رأس المال)"
            value={inventory?.totalAssetValue}
            loading={isLoading}
            tone="neutral"
          />
          <KpiCard
            label="قيمة المبيعات المتوقعة"
            value={inventory?.expectedRetailValue}
            loading={isLoading}
            tone="neutral"
          />
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-right shadow-sm">
            <p className="text-xs font-semibold tracking-wide text-slate-500">
              هامش الربح المتوقع
            </p>
            <p
              className={clsx(
                "mt-2 text-2xl font-bold tabular-nums",
                (inventory?.potentialGrossMargin ?? 0) < 0
                  ? "text-red-700"
                  : "text-emerald-700",
              )}
            >
              {isLoading
                ? "…"
                : formatEGP(inventory?.potentialGrossMargin ?? 0)}
            </p>
            {!isLoading && inventory && (
              <p className="mt-1 text-xs text-slate-500">
                {inventory.marginPercent}% من قيمة البيع
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-800">
              مؤشر الإيرادات اليومية
            </h2>
            <Link
              href="/dashboard/shifts"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              سجل الورديات
            </Link>
          </div>
          <div className="mt-4 h-72">
            {isLoading ? (
              <p className="text-sm text-slate-400">جاري التحميل…</p>
            ) : chartDaily.length === 0 ? (
              <p className="text-sm text-slate-400">لا مبيعات في هذه الفترة</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartDaily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={56} />
                  <Tooltip
                    formatter={(value) => [
                      formatEGP(Number(value) || 0),
                      "الإيرادات",
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="#16a34a"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">
            أفضل 10 منتجات مبيعاً
          </h2>
          <div className="mt-4 h-72">
            {isLoading ? (
              <p className="text-sm text-slate-400">جاري التحميل…</p>
            ) : chartSellers.length === 0 ? (
              <p className="text-sm text-slate-400">
                لا مبيعات منتجات في هذه الفترة
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartSellers} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={100}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip
                    formatter={(value) => [Number(value), "Qty sold"]}
                    labelFormatter={(_, payload) =>
                      String(
                        (payload?.[0]?.payload as { fullName?: string })
                          ?.fullName ?? "",
                      )
                    }
                  />
                  <Bar dataKey="qty" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 text-right">
          <h2 className="text-sm font-semibold text-slate-800">
            تنبيهات نواقص المخزون
          </h2>
          <p className="text-xs text-slate-500">
            منتجات بمخزون ≤ 5 — اطلب من الموردين لإعادة التوريد
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">المنتج</th>
                <th className="px-4 py-3">كود الصنف</th>
                <th className="px-4 py-3 text-right">المخزون الحالي</th>
                <th className="px-4 py-3 text-right">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-10 text-center text-slate-400"
                  >
                    Loading…
                  </td>
                </tr>
              ) : lowStock.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-10 text-center text-slate-400"
                  >
                    No low-stock products — inventory looks healthy.
                  </td>
                </tr>
              ) : (
                lowStock.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {p.name}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {p.sku || p.barcode || "—"}
                    </td>
                    <td
                      className={clsx(
                        "px-4 py-3 text-right font-semibold tabular-nums",
                        p.stockQuantity <= 0
                          ? "text-red-700"
                          : "text-amber-700",
                      )}
                    >
                      {p.stockQuantity}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/purchases/new?productId=${encodeURIComponent(p.id)}`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                      >
                        <ShoppingCart className="h-3.5 w-3.5" />
                        اطلب الآن
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  loading,
  tone,
}: {
  label: string;
  value?: number;
  loading: boolean;
  tone: "neutral" | "auto" | "expense";
}) {
  const amount = value ?? 0;
  const color =
    tone === "expense"
      ? "text-red-700"
      : tone === "auto"
        ? amount < 0
          ? "text-red-700"
          : "text-emerald-700"
        : "text-slate-900";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 text-right shadow-sm">
      <p className="text-xs font-semibold tracking-wide text-slate-500">
        {label}
      </p>
      <p className={clsx("mt-2 text-2xl font-bold tabular-nums", color)}>
        {loading ? "…" : formatEGP(amount)}
      </p>
    </div>
  );
}
