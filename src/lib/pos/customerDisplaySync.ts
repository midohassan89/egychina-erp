export type CustomerDisplayMode =
  | "IDLE"
  | "SHOPPING"
  | "PAYMENT"
  | "COMPLETED";

export type CustomerDisplayItem = {
  id: string;
  name: string;
  /** Chinese product name when available. */
  nameZh?: string | null;
  /** Product thumbnail URL when available. */
  imageUrl?: string | null;
  qty: number;
  unitPrice: number;
  lineTotal: number;
};

export type CustomerDisplayCustomer = {
  name: string;
  pointsBalance: number;
} | null;

export type CustomerDisplayPayment = {
  method: string;
  methodLabel: string;
  paidAmount: number;
  changeAmount: number;
  /** EGP per 1 CNY — set when method is WeChat (UI hint only). */
  exchangeRate?: number | null;
} | null;

export type CustomerDisplayCompletedSale = {
  orderNumber: string;
  total: number;
  paidAmount: number;
  changeAmount: number;
  completedAt: number;
  /** Payment method id (e.g. wechat) for CFD multi-currency display. */
  paymentMethod?: string | null;
  /** EGP per 1 CNY when paid via WeChat. */
  exchangeRate?: number | null;
} | null;

/** Most recently added / qty-changed cart line for CFD highlight + scroll. */
export type CustomerDisplayLastUpdatedItem = {
  productId: string;
  lineId: string;
  name: string;
  nameZh?: string | null;
  imageUrl?: string | null;
  quantity: number;
  lineTotal: number;
  updatedAt: number;
} | null;

export type CustomerDisplayState = {
  version: 1;
  updatedAt: number;
  mode: CustomerDisplayMode;
  items: CustomerDisplayItem[];
  itemCount: number;
  subtotal: number;
  discount: number;
  total: number;
  customer: CustomerDisplayCustomer;
  payment: CustomerDisplayPayment;
  lastCompletedSale: CustomerDisplayCompletedSale;
  /** Last cart line id — customer screen scrolls to and highlights it. */
  highlightItemId: string | null;
  lastUpdatedItem: CustomerDisplayLastUpdatedItem;
};

export const CFD_CHANNEL = "egychina_pos_cfd";
export const CFD_STORAGE_KEY = "egychina_pos_cfd_state";
/** How long the thank-you / change screen stays before returning to IDLE. */
export const CFD_COMPLETED_MS = 20_000;

export function emptyCustomerDisplayState(
  partial?: Partial<CustomerDisplayState>,
): CustomerDisplayState {
  return {
    version: 1,
    updatedAt: Date.now(),
    mode: "IDLE",
    items: [],
    itemCount: 0,
    subtotal: 0,
    discount: 0,
    total: 0,
    customer: null,
    payment: null,
    lastCompletedSale: null,
    highlightItemId: null,
    lastUpdatedItem: null,
    ...partial,
  };
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function readCustomerDisplayState(): CustomerDisplayState {
  if (!canUseStorage()) return emptyCustomerDisplayState();
  try {
    const raw = localStorage.getItem(CFD_STORAGE_KEY);
    if (!raw) return emptyCustomerDisplayState();
    const parsed = JSON.parse(raw) as CustomerDisplayState;
    if (!parsed || parsed.version !== 1) return emptyCustomerDisplayState();
    return parsed;
  } catch {
    return emptyCustomerDisplayState();
  }
}

export function publishCustomerDisplayState(
  state: CustomerDisplayState,
): void {
  if (typeof window === "undefined") return;
  const next: CustomerDisplayState = {
    ...state,
    version: 1,
    updatedAt: Date.now(),
  };
  try {
    localStorage.setItem(CFD_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota / private mode failures — BroadcastChannel may still work.
  }
  try {
    const channel = new BroadcastChannel(CFD_CHANNEL);
    channel.postMessage(next);
    channel.close();
  } catch {
    // BroadcastChannel unavailable — localStorage write is the fallback.
  }
}

export function subscribeCustomerDisplayState(
  onState: (state: CustomerDisplayState) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;

  onState(readCustomerDisplayState());

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(CFD_CHANNEL);
    channel.onmessage = (event: MessageEvent<CustomerDisplayState>) => {
      if (event.data?.version === 1) onState(event.data);
    };
  } catch {
    channel = null;
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== CFD_STORAGE_KEY || !event.newValue) return;
    try {
      const parsed = JSON.parse(event.newValue) as CustomerDisplayState;
      if (parsed?.version === 1) onState(parsed);
    } catch {
      // ignore
    }
  };
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener("storage", onStorage);
    channel?.close();
  };
}

export function openCustomerDisplayWindow(): Window | null {
  if (typeof window === "undefined") return null;
  // noopener → separate renderer process so CFD cannot freeze /pos or print.
  return window.open(
    "/pos/customer-display",
    "EgyChinaCustomerDisplay",
    "noopener,noreferrer,width=1280,height=1024,menubar=no,toolbar=no,location=no,status=no",
  );
}
