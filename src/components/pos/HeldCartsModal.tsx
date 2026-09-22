"use client";

import { Clock, Play, X } from "lucide-react";
import type { HeldCart } from "@/lib/pos/heldCarts";
import { formatEGP } from "@/lib/pos/money";

interface HeldCartsModalProps {
  open: boolean;
  carts: HeldCart[];
  onClose: () => void;
  onResume: (id: string) => void;
  onDiscard?: (id: string) => void;
}

/**
 * List of suspended invoices — pick one to resume into the active cart.
 */
export function HeldCartsModal({
  open,
  carts,
  onClose,
  onResume,
  onDiscard,
}: HeldCartsModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/50 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="held-carts-title"
    >
      <div className="flex max-h-[min(85dvh,560px)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2
              id="held-carts-title"
              className="text-lg font-semibold text-slate-900"
            >
              Held Invoices
            </h2>
            <p className="text-sm text-slate-500">
              الفواتير المعلقة · {carts.length} held
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {carts.length === 0 ? (
            <p className="px-2 py-10 text-center text-sm text-slate-400">
              No held carts
            </p>
          ) : (
            <ul className="space-y-2">
              {[...carts]
                .sort(
                  (a, b) =>
                    new Date(b.heldAt).getTime() -
                    new Date(a.heldAt).getTime(),
                )
                .map((cart) => (
                  <li
                    key={cart.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                          <Clock className="h-4 w-4 text-amber-600" />
                          {cart.label}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {cart.itemCount}{" "}
                          {cart.itemCount === 1 ? "item" : "items"} ·{" "}
                          {formatEGP(cart.total)}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        {onDiscard && (
                          <button
                            type="button"
                            onClick={() => onDiscard(cart.id)}
                            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                          >
                            Discard
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onResume(cart.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                        >
                          <Play className="h-3.5 w-3.5" />
                          Resume
                        </button>
                      </div>
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
