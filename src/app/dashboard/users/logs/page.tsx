"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, X } from "lucide-react";
import { clsx } from "clsx";

interface AuditRow {
  id: number;
  action: string;
  entity: string;
  entityId: string | null;
  details: string | null;
  createdAt: string;
  user: { id: string; username: string; role: string };
}

const ENTITY_AR: Record<string, string> = {
  PRODUCT: "منتج",
  ORDER: "طلب",
  INVOICE: "فاتورة",
  SALE: "فاتورة",
  INVENTORY: "مخزون",
  USER: "مستخدم",
  POS: "نقطة البيع",
};

const ACTION_STYLES: Record<string, string> = {
  CREATE: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  UPDATE: "bg-sky-50 text-sky-800",
  DELETE: "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  PIN_OVERRIDE: "bg-amber-50 text-amber-900 dark:bg-amber-950/40",
  WITHDRAW: "bg-violet-50 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200",
  PASSWORD_CHANGE: "bg-slate-100 text-slate-700 dark:bg-gray-800 dark:text-gray-200",
};

function formatDetails(raw: string | null): string {
  if (!raw) return "No details recorded.";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AuditRow | null>(null);
  const [username, setUsername] = useState("");
  const [entity, setEntity] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (username.trim()) params.set("username", username.trim());
      if (entity) params.set("entity", entity);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/users/audit-logs?${params.toString()}`);
      const body = (await res.json()) as { error?: string; logs?: AuditRow[] };
      if (!res.ok) throw new Error(body.error ?? "Failed to load audit logs");
      setLogs(body.logs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setIsLoading(false);
    }
  }, [username, entity, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/dashboard/users"
            className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-gray-100"
          >
            <ArrowLeft className="h-4 w-4" />
            العودة للمستخدمين
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-gray-100">سجل الرقابة والعمليات</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">
            من نفّذ الحركة، الأحدث أولاً
          </p>
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/90 sm:grid-cols-4">
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="اسم المستخدم"
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
        />
        <select
          value={entity}
          onChange={(event) => setEntity(event.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
        >
          <option value="">كل الأنواع</option>
          <option value="PRODUCT">منتج</option>
          <option value="ORDER">طلب</option>
          <option value="INVOICE">فاتورة</option>
          <option value="INVENTORY">مخزون</option>
        </select>
        <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
        <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-gray-800">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-gray-800/60 dark:text-gray-400">
            <tr>
              <th className="px-4 py-3">التاريخ</th>
              <th className="px-4 py-3">المستخدم</th>
              <th className="px-4 py-3">الحركة</th>
              <th className="px-4 py-3">النوع</th>
              <th className="px-4 py-3">المعرّف</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400 dark:text-gray-500">
                  Loading…
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400 dark:text-gray-500">
                  No audit entries yet
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/80 dark:hover:bg-gray-800/60">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-gray-300">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-900 dark:text-gray-100">
                      {log.user.username}
                    </span>
                    <span className="ml-1.5 text-xs text-slate-400 dark:text-gray-500">
                      {log.user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={clsx(
                        "inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold",
                        ACTION_STYLES[log.action] ??
                          "bg-slate-100 text-slate-700 dark:bg-gray-800 dark:text-gray-200",
                      )}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-gray-200">
                    {ENTITY_AR[log.entity] ?? log.entity}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-gray-400">
                    {log.entityId ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setDetail(log)}
                      className="rounded-lg px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50 dark:text-brand-400"
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-gray-800">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-gray-100">
                  Audit Details
                </h2>
                <p className="text-sm text-slate-500 dark:text-gray-400">
                  #{detail.id} · {detail.action} · {detail.entity}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:text-gray-500 dark:hover:bg-gray-800"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 px-5 py-5 text-sm">
              <p>
                <span className="text-slate-500 dark:text-gray-400">User: </span>
                <span className="font-medium">{detail.user.username}</span>
              </p>
              <p>
                <span className="text-slate-500 dark:text-gray-400">When: </span>
                {new Date(detail.createdAt).toLocaleString()}
              </p>
              <pre className="max-h-72 overflow-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-100">
                {formatDetails(detail.details)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
