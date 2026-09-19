"use client";

import { useState } from "react";
import { formatEGP } from "@/lib/pos/money";
import { PosKeyboardInput } from "@/components/pos/PosKeyboardInput";
import {
  PosKeyboardScrollArea,
  usePosKeyboardOptional,
} from "@/components/pos/PosKeyboardContext";

interface ShiftStartScreenProps {
  onOpen: (startingCash: number) => Promise<void>;
}

const QUICK_AMOUNTS = [200, 500, 1000, 2000] as const;

export function ShiftStartScreen({ onOpen }: ShiftStartScreenProps) {
  const kb = usePosKeyboardOptional();
  const [cashInput, setCashInput] = useState("500");
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleOpen() {
    const amount = parseFloat(cashInput);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Enter a valid starting cash amount.");
      return;
    }

    setIsOpening(true);
    setError(null);
    try {
      kb?.close();
      await onOpen(amount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open shift");
    } finally {
      setIsOpening(false);
    }
  }

  return (
    <div className="pos-no-print fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/95 p-3">
      <div className="flex max-h-[min(92dvh,640px)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <PosKeyboardScrollArea className="flex-1 p-6">
          <div className="text-center">
            <p className="text-sm font-medium text-brand-600">Souq El Obour</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">
              Open Shift
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Enter the starting cash in the drawer to begin your shift. The POS
              stays locked until the register is opened.
            </p>
          </div>

          <label className="mt-6 block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">
              Starting cash (EGP)
            </span>
            <PosKeyboardInput
              inputName="shift-cash"
              mode="numpad"
              type="text"
              inputMode="none"
              value={cashInput}
              onChange={setCashInput}
              onEnter={() => void handleOpen()}
              autoFocus
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-2xl font-bold tabular-nums focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </label>

          <div className="mt-3 grid grid-cols-4 gap-2">
            {QUICK_AMOUNTS.map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => setCashInput(String(amount))}
                className="rounded-xl border border-slate-200 py-2.5 text-sm font-semibold hover:border-brand-400 hover:bg-brand-50"
              >
                {amount}
              </button>
            ))}
          </div>

          {error && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={isOpening}
            onClick={() => void handleOpen()}
            className="mt-6 w-full rounded-xl bg-brand-600 py-4 text-lg font-semibold text-white hover:bg-brand-700 disabled:bg-slate-300"
          >
            {isOpening
              ? "Opening…"
              : `Open with ${formatEGP(parseFloat(cashInput) || 0)}`}
          </button>
        </PosKeyboardScrollArea>
      </div>
    </div>
  );
}
