import type { CartLine } from "@/types/pos";
import { roundMoney } from "@/lib/pos/money";

export interface HeldCart {
  id: string;
  lines: CartLine[];
  total: number;
  itemCount: number;
  /** ISO timestamp for sorting / persistence. */
  heldAt: string;
  /** Display time e.g. "10:15 AM". */
  label: string;
}

const STORAGE_KEY = "souq-pos-held-carts-v1";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `held-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatHeldLabel(date = new Date()): string {
  try {
    return date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return date.toISOString().slice(11, 16);
  }
}

export function createHeldCart(lines: CartLine[]): HeldCart {
  const now = new Date();
  const itemCount = lines.reduce(
    (sum, line) => sum + (line.isScalePriced ? 1 : Math.abs(line.qty)),
    0,
  );
  const total = roundMoney(
    lines.reduce((sum, line) => sum + line.lineTotal, 0),
  );
  return {
    id: newId(),
    lines,
    total,
    itemCount,
    heldAt: now.toISOString(),
    label: formatHeldLabel(now),
  };
}

export function loadHeldCarts(): HeldCart[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HeldCart[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (h) =>
        h &&
        typeof h.id === "string" &&
        Array.isArray(h.lines) &&
        typeof h.total === "number",
    );
  } catch {
    return [];
  }
}

export function saveHeldCarts(carts: HeldCart[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(carts));
  } catch (err) {
    console.error("[heldCarts] failed to persist", err);
  }
}
