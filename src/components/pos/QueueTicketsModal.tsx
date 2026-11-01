"use client";

import { useCallback, useEffect, useState } from "react";
import { ListOrdered, Play, RefreshCw, X } from "lucide-react";
import { formatEGP } from "@/lib/pos/money";

export type QueueTicketListRow = {
  id: string;
  code: string;
  status: string;
  total: number;
  customerName: string | null;
  customerPhone: string | null;
  createdByName: string | null;
  createdAt: string;
  items: { name: string; quantity: number }[];
};

interface QueueTicketsModalProps {
  open: boolean;
  onClose: () => void;
  onClaim: (code: string) => Promise<void> | void;
}

export function QueueTicketsModal({
  open,
  onClose,
  onClaim,
}: QueueTicketsModalProps) {
  const [tickets, setTickets] = useState<QueueTicketListRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pos/queue-tickets", { cache: "no-store" });
      const body = (await res.json()) as {
        error?: string;
        tickets?: QueueTicketListRow[];
      };
      if (!res.ok) throw new Error(body.error ?? "Failed to load tickets");
      setTickets(body.tickets ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tickets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/50 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="queue-tickets-title"
    >
      <div className="flex max-h-[min(85dvh,620px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2
              id="queue-tickets-title"
              className="text-lg font-semibold text-slate-900"
            >
              قسائم الموبايل
            </h2>
            <p className="text-sm text-slate-500">
              Queue tickets · {tickets.length} active
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              aria-label="Refresh"
            >
              <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {error ? (
            <p className="px-2 py-6 text-center text-sm text-red-600">{error}</p>
          ) : loading && tickets.length === 0 ? (
            <p className="px-2 py-10 text-center text-sm text-slate-400">
              جاري التحميل...
            </p>
          ) : tickets.length === 0 ? (
            <p className="px-2 py-10 text-center text-sm text-slate-400">
              لا توجد قسائم معلقة
            </p>
          ) : (
            <ul className="space-y-2">
              {tickets.map((ticket) => (
                <li
                  key={ticket.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-900">
                        <ListOrdered className="h-4 w-4 text-teal-600" />
                        {ticket.code}
                        <span
                          className={
                            ticket.status === "CLAIMED"
                              ? "rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800"
                              : "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800"
                          }
                        >
                          {ticket.status}
                        </span>
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {ticket.customerName || ticket.customerPhone || "بدون عميل"}
                        {" · "}
                        {ticket.items.length} أصناف · {formatEGP(ticket.total)}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {ticket.createdByName || "—"} ·{" "}
                        {new Date(ticket.createdAt).toLocaleTimeString("ar-EG", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={claiming === ticket.code}
                      onClick={() => {
                        void (async () => {
                          setClaiming(ticket.code);
                          try {
                            await onClaim(ticket.code);
                            onClose();
                          } finally {
                            setClaiming(null);
                          }
                        })();
                      }}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-teal-600 px-3 py-2 text-sm font-bold text-white hover:bg-teal-500 disabled:opacity-60"
                    >
                      <Play className="h-4 w-4" />
                      تحميل
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
