"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { PosKeyboardInput } from "@/components/pos/PosKeyboardInput";
import {
  PosKeyboardScrollArea,
  usePosKeyboardOptional,
} from "@/components/pos/PosKeyboardContext";

export interface PinAuthorizationSuccess {
  managerId: string;
  managerName: string;
  role?: string;
}

export type PinAuthAction =
  | "return_mode"
  | "delete_item"
  | "open_drawer"
  | "custom";

const ACTION_COPY: Record<
  PinAuthAction,
  { title: string; subtitle: string; button: string; hint: string }
> = {
  return_mode: {
    title: "وضع الاسترجاع · Return Mode",
    subtitle: "يتطلب رمز المدير / Manager PIN required",
    button: "Authorize Return Mode",
    hint: "Enter a Manager or Admin PIN to authorize product returns.",
  },
  delete_item: {
    title: "حذف صنف · Delete Item",
    subtitle: "يتطلب رمز المدير / Manager PIN required",
    button: "Authorize Delete",
    hint: "Cashiers need Manager/Admin approval to remove items from the cart.",
  },
  open_drawer: {
    title: "فتح الدرج · Open Drawer",
    subtitle: "يتطلب رمز المدير / Manager PIN required",
    button: "Authorize Open Drawer",
    hint: "Enter a Manager or Admin PIN to open the cash drawer manually.",
  },
  custom: {
    title: "Manager Authorization",
    subtitle: "Manager PIN required",
    button: "Authorize",
    hint: "Enter a Manager or Admin PIN to continue.",
  },
};

interface PinAuthorizationModalProps {
  open: boolean;
  action?: PinAuthAction;
  title?: string;
  onClose: () => void;
  onVerified: (result: PinAuthorizationSuccess) => void;
}

/**
 * Reusable Manager/Admin PIN gate for sensitive POS actions.
 */
export function PinAuthorizationModal({
  open,
  action = "custom",
  title,
  onClose,
  onVerified,
}: PinAuthorizationModalProps) {
  const kb = usePosKeyboardOptional();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const copy = ACTION_COPY[action];

  useEffect(() => {
    if (open) {
      setPin("");
      setError(null);
      setIsVerifying(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) kb?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close only when dialog closes
  }, [open]);

  if (!open) return null;

  function handleClose() {
    if (isVerifying) return;
    kb?.close();
    onClose();
  }

  async function verify() {
    const trimmed = pin.trim();
    if (trimmed.length < 4) {
      setError("أدخل الرمز / Enter PIN");
      return;
    }

    setIsVerifying(true);
    setError(null);
    try {
      const response = await fetch("/api/users/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: trimmed, action }),
      });
      const body = (await response.json()) as {
        error?: string;
        managerId?: string;
        managerName?: string;
        role?: string;
      };

      if (!response.ok || !body.managerId) {
        setError(body.error ?? "Unauthorized");
        setPin("");
        return;
      }

      kb?.close();
      onVerified({
        managerId: body.managerId,
        managerName: body.managerName ?? "Manager",
        role: body.role,
      });
    } catch {
      setError("Could not verify PIN — try again");
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-3">
      <div className="flex max-h-[min(92dvh,520px)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-red-100 bg-red-50 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-red-900">
              {title ?? copy.title}
            </h2>
            <p className="text-sm text-red-700/80">{copy.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isVerifying}
            className="rounded-lg p-2 text-red-400 hover:bg-red-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <PosKeyboardScrollArea className="flex-1 space-y-4 px-5 py-5">
          <p className="text-sm text-slate-600">{copy.hint}</p>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">
              Manager / Admin PIN
            </span>
            <PosKeyboardInput
              inputName="auth-pin"
              mode="numpad"
              type="password"
              inputMode="none"
              value={pin}
              onChange={(v) => setPin(v.replace(/[^\d]/g, "").slice(0, 12))}
              onEnter={() => void verify()}
              autoFocus
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-2xl font-bold tracking-[0.35em] tabular-nums focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
            />
          </label>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
        </PosKeyboardScrollArea>

        <div className="shrink-0 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            disabled={isVerifying || pin.trim().length < 4}
            onClick={() => void verify()}
            className="w-full rounded-xl bg-red-600 py-3.5 text-lg font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isVerifying ? "Verifying…" : copy.button}
          </button>
        </div>
      </div>
    </div>
  );
}
