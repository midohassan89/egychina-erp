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

const ACTION_STYLES: Record<string, string> = {
  CREATE: "bg-emerald-50 text-emerald-800",
  UPDATE: "bg-sky-50 text-sky-800",
  DELETE: "bg-red-50 text-red-800",
  PIN_OVERRIDE: "bg-amber-50 text-amber-900",
  WITHDRAW: "bg-violet-50 text-violet-800",
  PASSWORD_CHANGE: "bg-slate-100 text-slate-700",
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

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/users/audit-logs");
      const body = (await res.json()) as { error?: string; logs?: AuditRow[] };
      if (!res.ok) throw new Error(body.error ?? "Failed to load audit logs");
      setLogs(body.logs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/dashboard/users"
            className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Users
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Audit Trail</h1>
          <p className="mt-1 text-sm text-slate-500">
            سجل النشاط — who did what, newest first (Admin only)
          </p>
        </div>
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Date / Time</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Entity</th>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  No audit entries yet
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-900">
                      {log.user.username}
                    </span>
                    <span className="ml-1.5 text-xs text-slate-400">
                      {log.user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={clsx(
                        "inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold",
                        ACTION_STYLES[log.action] ??
                          "bg-slate-100 text-slate-700",
                      )}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {log.entity}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    {log.entityId ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setDetail(log)}
                      className="rounded-lg px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
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
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Audit Details
                </h2>
                <p className="text-sm text-slate-500">
                  #{detail.id} · {detail.action} · {detail.entity}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 px-5 py-5 text-sm">
              <p>
                <span className="text-slate-500">User: </span>
                <span className="font-medium">{detail.user.username}</span>
              </p>
              <p>
                <span className="text-slate-500">When: </span>
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
