"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Wallet } from "lucide-react";
import { getCachedCustomers, getSales } from "@/lib/cache/indexeddb";
import { useCart } from "@/hooks/useCart";
import { useCatalogSync } from "@/hooks/useCatalogSync";
import { useCheckout } from "@/hooks/useCheckout";
import { useOfflineSync, PENDING_SALE_ALERT_THRESHOLD } from "@/hooks/useOfflineSync";
import { useReceiptPrint } from "@/hooks/useReceiptPrint";
import { useShift } from "@/hooks/useShift";
import { builtInQuickTapProducts } from "@/lib/pos/scaleCatalog";
import { getOpBarcodes } from "@/lib/pos/opBarcode";
import { posItemKey } from "@/lib/pos/posItemKey";
import { buildBarcodeMap } from "@/lib/pos/barcodeMap";
import { resolveScannedBarcode } from "@/lib/pos/resolveBarcode";
import { isCustomerLoyaltyScan, normalizeLoyaltyPhone } from "@/lib/pos/loyaltyScan";
import { formatEGP, formatQty } from "@/lib/pos/money";
import { CartPanel, cartItemDomId } from "@/components/pos/CartPanel";
import { CheckoutDialog } from "@/components/pos/CheckoutDialog";
import { HeldCartsModal } from "@/components/pos/HeldCartsModal";
import {
  PinAuthorizationModal,
  type PinAuthAction,
} from "@/components/pos/PinAuthorizationModal";
import {
  ProductGrid,
  type ProductGridHandle,
} from "@/components/pos/ProductGrid";
import { ProductNotFoundModal } from "@/components/pos/ProductNotFoundModal";
import { PriceCheckModal } from "@/components/pos/PriceCheckModal";
import { SaleSyncStatusBadge } from "@/components/pos/SaleSyncStatus";
import { ShiftStartScreen } from "@/components/pos/ShiftStartScreen";
import { ZReportModal } from "@/components/pos/ZReportModal";
import { PosKeyboardProvider, usePosKeyboard } from "@/components/pos/PosKeyboardContext";
import { PosTouchKeyboardHost } from "@/components/pos/PosTouchKeyboard";
import { isManagerOrAdmin } from "@/lib/auth/roles";
import { playErrorBeep, playSuccessBeep } from "@/lib/pos/errorBeep";
import { findReceiptLines, looksLikeReceiptCode, type ReceiptLine } from "@/lib/pos/findReceipt";
import type { CartLine } from "@/types/pos";
import { usePosDesk } from "@/hooks/usePosDesk";
import { PosOnlineDrawer } from "@/components/pos/PosOnlineDrawer";
import { PosChatDrawer } from "@/components/pos/PosChatDrawer";
import {
  createHeldCart,
  loadHeldCarts,
  saveHeldCarts,
  type HeldCart,
} from "@/lib/pos/heldCarts";
import type {
  CachedCustomer,
  CachedProduct,
  LocalSale,
  ZReportSummary,
} from "@/types/woocommerce";

type PendingPinAction =
  | { type: "return_mode"; receiptCode?: string }
  | { type: "delete_item"; lineId: string }
  | { type: "open_drawer" };

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function POSPage() {
  return (
    <PosKeyboardProvider>
      <POSPageInner />
    </PosKeyboardProvider>
  );
}

function POSPageInner() {
  const { data: session } = useSession();
  const { close: closeKeyboard } = usePosKeyboard();
  const { products, productCount, isLoading, isOnline } = useCatalogSync();
  const { pendingCount, overPendingLimit } = useOfflineSync();
  const [returnMode, setReturnMode] = useState(false);
  const [managerAuth, setManagerAuth] = useState<{
    managerId: string;
    managerName: string;
  } | null>(null);
  const [pendingPin, setPendingPin] = useState<PendingPinAction | null>(null);
  const canBypassPin = isManagerOrAdmin(session?.user?.role);

  const cart = useCart(returnMode);
  const checkout = useCheckout();
  const { printReceipt, printZReport, receiptNode } = useReceiptPrint();
  const shiftApi = useShift();
  const closeDoneRef = useRef(false);
  const [customers, setCustomers] = useState<CachedCustomer[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [zReportOpen, setZReportOpen] = useState(false);
  const [zReport, setZReport] = useState<ZReportSummary | null>(null);
  const [isClosingShift, setIsClosingShift] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<{
    id: string;
    name: string | null;
    phone: string;
    pointsBalance: number;
  } | null>(null);
  const [redeemPoints, setRedeemPoints] = useState(false);
  /** Blocking not-found interrupt — must dismiss before next scan. */
  const [notFoundBarcode, setNotFoundBarcode] = useState<string | null>(null);
  const [priceCheckOpen, setPriceCheckOpen] = useState(false);
  const [heldCarts, setHeldCarts] = useState<HeldCart[]>([]);
  const [heldReady, setHeldReady] = useState(false);
  const [heldModalOpen, setHeldModalOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const desk = usePosDesk((message) => setToast(message));
  const [posDark, setPosDark] = useState(false);
  const [shiftDetailsOpen, setShiftDetailsOpen] = useState(false);
  const shiftDetailsRef = useRef<HTMLDivElement | null>(null);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [recentSales, setRecentSales] = useState<LocalSale[]>([]);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(
    null,
  );
  const cartListRef = useRef<HTMLDivElement | null>(null);
  const productGridRef = useRef<ProductGridHandle | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const scrollTimerRef = useRef<number | null>(null);
  const pendingReceiptLines = useRef<CartLine[] | null>(null);
  const scanBufferRef = useRef("");
  const lastScanAtRef = useRef(0);
  const scanHandlerRef = useRef<(raw: string) => boolean>(() => false);
  const scanBlockedRef = useRef(false);

  const focusBarcodeSearch = useCallback(() => {
    window.setTimeout(() => {
      productGridRef.current?.focusSearch();
    }, 50);
  }, []);

  // Restore suspended carts after refresh.
  useEffect(() => {
    setHeldCarts(loadHeldCarts());
    setHeldReady(true);
  }, []);

  useEffect(() => {
    if (!heldReady) return;
    saveHeldCarts(heldCarts);
  }, [heldCarts, heldReady]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    setPosDark(window.localStorage.getItem("pos-theme") === "dark");
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  useEffect(() => {
    void getSales().then((sales) => setRecentSales(sales.slice(0, 6)));
  }, [checkout.lastSale, pendingCount]);

  const pendingAlertArmed = useRef(false);
  useEffect(() => {
    if (overPendingLimit && !pendingAlertArmed.current) {
      pendingAlertArmed.current = true;
      playErrorBeep();
    }
    if (!overPendingLimit) pendingAlertArmed.current = false;
  }, [overPendingLimit]);

  const catalog = useMemo(() => mergeCatalog(products), [products]);
  const barcodeMap = useMemo(() => buildBarcodeMap(catalog), [catalog]);
  const shiftLocked = !shiftApi.isLoading && !shiftApi.isOpen;

  const openPriceCheck = useCallback(() => {
    if (shiftLocked || isClosingShift || notFoundBarcode) return;
    setPriceCheckOpen(true);
  }, [shiftLocked, isClosingShift, notFoundBarcode]);

  const closePriceCheck = useCallback(() => {
    setPriceCheckOpen(false);
    focusBarcodeSearch();
  }, [focusBarcodeSearch]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "F4") return;
      if (notFoundBarcode || checkoutOpen || zReportOpen || pendingPin) return;
      e.preventDefault();
      if (shiftLocked || isClosingShift) return;
      setPriceCheckOpen((open) => (open ? open : true));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    notFoundBarcode,
    checkoutOpen,
    zReportOpen,
    pendingPin,
    shiftLocked,
    isClosingShift,
  ]);

  const disableReturnMode = useCallback(() => {
    setReturnMode(false);
    setManagerAuth(null);
    setPendingPin(null);
  }, []);

  const requestPin = useCallback(
    (action: PendingPinAction) => {
      if (canBypassPin) {
        if (action.type === "return_mode") {
          cart.clear();
          setManagerAuth({
            managerId: session?.user?.id ?? "self",
            managerName: session?.user?.name ?? "Manager",
          });
          setReturnMode(true);
          setScanMessage(
            `Return mode · authorized by ${session?.user?.name ?? "you"}`,
          );
        } else if (action.type === "delete_item") {
          cart.removeLine(action.lineId);
        } else if (action.type === "open_drawer") {
          setScanMessage("Cash drawer open command sent");
        }
        return;
      }
      setPendingPin(action);
    },
    [canBypassPin, cart.clear, cart.removeLine, session?.user?.id, session?.user?.name],
  );

  const handleRemoveLine = useCallback(
    (lineId: string) => {
      requestPin({ type: "delete_item", lineId });
    },
    [requestPin],
  );

  const handleOpenDrawer = useCallback(() => {
    requestPin({ type: "open_drawer" });
  }, [requestPin]);

  const flashCartItem = useCallback((itemKey: string, isNew: boolean) => {
    setHighlightedItemId(itemKey);
    if (highlightTimerRef.current != null) {
      window.clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightedItemId(null);
      highlightTimerRef.current = null;
    }, 1000);

    if (scrollTimerRef.current != null) {
      window.clearTimeout(scrollTimerRef.current);
    }

    if (isNew) {
      // New row — wait for DOM, then scroll cart list to absolute bottom only.
      scrollTimerRef.current = window.setTimeout(() => {
        scrollTimerRef.current = null;
        const container = cartListRef.current;
        if (!container) return;
        container.scrollTop = container.scrollHeight;
      }, 100);
      return;
    }

    // Existing row (qty increment) — never scroll to bottom; center that row.
    scrollTimerRef.current = window.setTimeout(() => {
      scrollTimerRef.current = null;
        document
          .getElementById(cartItemDomId(itemKey))
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }, []);

  const handleAddProduct = useCallback(
    (product: CachedProduct) => {
      const existingItem = cart.lines.find(
        (item) =>
          posItemKey(item.product) === posItemKey(product) &&
          !item.isScalePriced,
      );
      cart.addProduct(product);
      flashCartItem(posItemKey(product), !existingItem);
    },
    [cart.lines, cart.addProduct, flashCartItem],
  );

  useEffect(() => {
    getCachedCustomers().then(setCustomers);
  }, []);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current != null) {
        window.clearTimeout(highlightTimerRef.current);
      }
      if (scrollTimerRef.current != null) {
        window.clearTimeout(scrollTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!scanMessage && !scanError) return;
    const timer = window.setTimeout(() => {
      setScanMessage(null);
      setScanError(null);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [scanMessage, scanError]);

  useEffect(() => {
    if (!shiftDetailsOpen) return;
    function onPointerDown(event: MouseEvent) {
      const root = shiftDetailsRef.current;
      if (root && !root.contains(event.target as Node)) {
        setShiftDetailsOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setShiftDetailsOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [shiftDetailsOpen]);

  const handleBarcodeEnter = useCallback((rawInput: string): boolean => {
    return scanHandlerRef.current(rawInput);
  }, []);

  function scanBarcode(rawInput: string): boolean {
      const scanned = rawInput.trim();
      const cleanPhone = normalizeLoyaltyPhone(scanned);
      if (isCustomerLoyaltyScan(cleanPhone)) {
        void (async () => {
          try {
            const res = await fetch(
              `/api/admin/customers/search?phone=${encodeURIComponent(cleanPhone)}`,
              { cache: "no-store" },
            );
            const body = (await res.json()) as {
              error?: string;
              customer?: {
                id: string;
                name: string | null;
                phone: string;
                pointsBalance: number;
              };
            };
            if (!res.ok || !body.customer) {
              setSelectedCustomer(null);
              setRedeemPoints(false);
              setScanMessage(null);
              setScanError(body.error ?? "عميل غير موجود");
              playErrorBeep();
              return;
            }
            setSelectedCustomer(body.customer);
            setRedeemPoints(false);
            setScanError(null);
            const label = body.customer.name?.trim() || body.customer.phone;
            setScanMessage(
              `${label} · ${body.customer.pointsBalance.toLocaleString()} نقطة`,
            );
            playSuccessBeep();
          } catch {
            setScanError("Could not look up customer");
            playErrorBeep();
          }
        })();
        closeKeyboard();
        return true;
      }

      const result = resolveScannedBarcode(rawInput, catalog, barcodeMap);

      if ("error" in result || !result.product) {
        if (looksLikeReceiptCode(rawInput)) {
          void openReceiptReturn(rawInput.trim());
          return true;
        }
        const code = rawInput.trim().replace(/\D/g, "") || rawInput.trim();
        playErrorBeep();
        closeKeyboard();
        setNotFoundBarcode(code);
        setScanError("المنتج غير متوفر");
        setScanMessage(null);
        return false;
      }

      if (result.isWeighted || result.isScalePriced) {
        cart.addScaleLine({
          product: result.product,
          customTotal: result.lineTotal,
          qty: result.qty,
          unitPrice: result.unitPrice,
          barcode: result.barcode,
          plu: result.plu,
        });
        // Scale lines are always appended as new rows.
        flashCartItem(posItemKey(result.product), true);
        const weightLabel =
          result.weightKg != null ? ` · ${formatQty(result.weightKg)} kg` : "";
        setScanMessage(
          returnMode
            ? `Return ${result.product.name}${weightLabel} · ${formatEGP(-Math.abs(result.lineTotal))}`
            : `Added ${result.product.name}${weightLabel} · ${formatEGP(result.lineTotal)}`,
        );
      } else {
        const existingItem = cart.lines.find(
          (item) =>
            posItemKey(item.product) === posItemKey(result.product) &&
            !item.isScalePriced,
        );
        cart.addProduct(result.product, 1);
        flashCartItem(posItemKey(result.product), !existingItem);
        setScanMessage(
          returnMode
            ? `Return ${result.product.name}`
            : `Added ${result.product.name}`,
        );
      }

      setScanError(null);
      return true;
  }

  scanHandlerRef.current = (rawInput: string): boolean => {
    if (shiftLocked || notFoundBarcode || priceCheckOpen) return false;
    try {
      return scanBarcode(rawInput);
    } catch (error) {
      console.error("[pos] barcode scan failed", error);
      playErrorBeep();
      closeKeyboard();
      setNotFoundBarcode(rawInput.trim() || "—");
      setScanError("المنتج غير متوفر");
      setScanMessage(null);
      return false;
    }
  };

  scanBlockedRef.current =
    shiftLocked ||
    !!notFoundBarcode ||
    priceCheckOpen ||
    checkoutOpen ||
    zReportOpen ||
    !!pendingPin;

  async function openReceiptReturn(code: string) {
    const lines = await findReceiptLines(code);
    if (!lines) {
      const explicit = /^POS-|^WC-/i.test(code);
      playErrorBeep();
      if (explicit) {
        setScanError("فاتورة غير موجودة");
        setScanMessage(null);
        return;
      }
      closeKeyboard();
      setNotFoundBarcode(code);
      setScanError("المنتج غير متوفر");
      setScanMessage(null);
      return;
    }
    const cartLines = toReturnLines(lines, catalog);
    if (returnMode && (managerAuth || canBypassPin)) {
      cart.replaceLines(cartLines);
      setScanError(null);
      setScanMessage(`تم تحميل فاتورة ${code}`);
      playSuccessBeep();
      return;
    }
    pendingReceiptLines.current = cartLines;
    if (canBypassPin) {
      setManagerAuth({
        managerId: session?.user?.id ?? "self",
        managerName: session?.user?.name ?? "Manager",
      });
      setReturnMode(true);
      cart.replaceLines(cartLines);
      pendingReceiptLines.current = null;
      setScanError(null);
      setScanMessage(`وضع الاسترجاع · ${code}`);
      playSuccessBeep();
      return;
    }
    setPendingPin({ type: "return_mode", receiptCode: code });
    setScanMessage("أدخل الرقم السري لتحميل الفاتورة");
  }

  useEffect(() => {
    function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
      const prototype =
        el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      setter?.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "F4") return;
      if (scanBlockedRef.current) return;

      const now = performance.now();
      if (event.key === "Enter") {
        const code = scanBufferRef.current.trim();
        const gap = lastScanAtRef.current > 0 ? now - lastScanAtRef.current : Number.POSITIVE_INFINITY;
        const fromScanner = code.length >= 4 && gap < 35;
        scanBufferRef.current = "";
        lastScanAtRef.current = 0;
        if (!fromScanner) return;

        event.preventDefault();
        event.stopPropagation();
        productGridRef.current?.clearSearch();
        try {
          scanHandlerRef.current(code);
        } catch (error) {
          console.error("[pos] barcode scan failed", error);
          setNotFoundBarcode(code);
          setScanError("المنتج غير متوفر");
        }
        return;
      }

      if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      const gap = lastScanAtRef.current > 0 ? now - lastScanAtRef.current : Number.POSITIVE_INFINITY;
      if (gap < 35) {
        event.preventDefault();
        event.stopPropagation();
        const target = event.target;
        if (
          scanBufferRef.current.length === 1 &&
          (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
        ) {
          const leaked = scanBufferRef.current;
          if (target.value.endsWith(leaked)) {
            setNativeValue(target, target.value.slice(0, -leaked.length));
          }
        }
        scanBufferRef.current += event.key;
      } else {
        scanBufferRef.current = event.key;
      }
      lastScanAtRef.current = now;
    }

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const dismissNotFound = useCallback(() => {
    setNotFoundBarcode(null);
    focusBarcodeSearch();
  }, [focusBarcodeSearch]);

  const holdCurrentCart = useCallback(() => {
    if (cart.lines.length === 0 || returnMode) return;
    const snapshot = createHeldCart(cart.lines);
    setHeldCarts((prev) => [snapshot, ...prev]);
    cart.clear();
    setToast(`Invoice held at ${snapshot.label} · تم تعليق الفاتورة`);
    focusBarcodeSearch();
  }, [cart.lines, cart.clear, returnMode, focusBarcodeSearch]);

  const resumeHeldCart = useCallback(
    (id: string) => {
      const target = heldCarts.find((h) => h.id === id);
      if (!target) return;

      const currentLines = cart.lines;
      setHeldCarts((prev) => {
        let next = prev.filter((h) => h.id !== id);
        if (currentLines.length > 0) {
          next = [createHeldCart(currentLines), ...next];
        }
        return next;
      });
      cart.replaceLines(target.lines);
      setHeldModalOpen(false);
      setToast(
        currentLines.length > 0
          ? `Resumed ${target.label} · current cart was held`
          : `Resumed invoice ${target.label}`,
      );
      focusBarcodeSearch();
    },
    [heldCarts, cart.lines, cart.replaceLines, focusBarcodeSearch],
  );

  const discardHeldCart = useCallback((id: string) => {
    setHeldCarts((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const finalizeClose = useCallback(
    async (actualCash: number) => {
      if (closeDoneRef.current) return;
      closeDoneRef.current = true;

      try {
        const result = await shiftApi.closeShift(actualCash);
        cart.clear();
        disableReturnMode();
        setZReportOpen(false);
        setZReport(null);
        setCheckoutOpen(false);
        setIsClosingShift(false);
        printZReport(result.report);
        setScanMessage(
          `Register closed · deposited ${formatEGP(actualCash)} to Treasury` +
            (Math.abs(result.variance) >= 0.01
              ? ` · variance ${formatEGP(result.variance)}`
              : ""),
        );
      } catch (err) {
        closeDoneRef.current = false;
        setIsClosingShift(false);
        setScanError(
          err instanceof Error ? err.message : "Could not close shift",
        );
      }
    },
    [shiftApi, cart, disableReturnMode, printZReport],
  );

  async function openZReportModal() {
    await shiftApi.refresh();
    const report = await shiftApi.buildCurrentZReport();
    if (!report) return;
    setZReport(report);
    setZReportOpen(true);
  }

  function confirmCloseRegister(actualCash: number) {
    setIsClosingShift(true);
    void finalizeClose(actualCash);
  }

  function handleReturnModeClick() {
    if (returnMode) {
      cart.clear();
      disableReturnMode();
      setScanMessage("Return mode ended");
      return;
    }
    requestPin({ type: "return_mode" });
  }

  const pinAction: PinAuthAction =
    pendingPin?.type === "delete_item"
      ? "delete_item"
      : pendingPin?.type === "open_drawer"
        ? "open_drawer"
        : "return_mode";

  const canRedeemPoints =
    !!selectedCustomer &&
    !returnMode &&
    selectedCustomer.pointsBalance >= 1000;
  const pointsDiscount =
    canRedeemPoints && redeemPoints
      ? Math.min(
          Math.floor(selectedCustomer.pointsBalance / 1000),
          Math.floor(Math.max(0, cart.total)),
        )
      : 0;
  const payableTotal = Math.max(0, cart.total - pointsDiscount);

  return (
    <>
      {shiftLocked && (
        <ShiftStartScreen
          onOpen={async (cash) => {
            await shiftApi.openShift(cash);
          }}
        />
      )}

      <div
        dir="rtl"
        className={`pos-shell pos-no-print flex h-full min-h-0 flex-col overflow-hidden bg-slate-200 select-none ${posDark ? "pos-dark" : ""}`}
      >
        {overPendingLimit && (
          <div
            role="alert"
            className="sticky top-0 z-40 shrink-0 border-b border-amber-800 bg-amber-400 px-4 py-3 text-amber-950"
          >
            <p className="text-sm font-bold sm:text-base">
              {pendingCount} عملية لا تزال على هذا الجهاز
            </p>
            <p className="mt-0.5 text-sm">
              أكثر من {PENDING_SALE_ALERT_THRESHOLD} فواتير لم تتم مزامنتها.
              تحقق من الاتصال بالإنترنت. المبيعات محفوظة على الجهاز وستُرسل
              تلقائياً عند عودة الاتصال.
            </p>
          </div>
        )}
        <header
          className={
            returnMode
              ? "flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-red-800 bg-red-950 px-4 py-3 text-white"
              : "flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3 text-white"
          }
        >
          <div className="flex min-w-0 items-center gap-3 text-right">
            <img
              src="/logos/logo-ar.svg"
              alt="ايجي شاينا ماركت"
              className="h-10 w-auto shrink-0 rounded-md bg-white object-contain px-1.5 sm:h-12"
            />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">
                سوق العبور - الكاشير
                {returnMode ? " · وضع الاسترجاع" : ""}
              </h1>
              {returnMode && managerAuth ? (
                <p className="mt-0.5 text-xs text-red-200 sm:text-sm">
                  تفويض {managerAuth.managerName}
                </p>
              ) : null}
            </div>
            <div className="relative shrink-0" ref={shiftDetailsRef}>
              <button
                type="button"
                onClick={() => setShiftDetailsOpen((open) => !open)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-600"
                aria-expanded={shiftDetailsOpen}
                aria-haspopup="dialog"
                aria-label="تفاصيل الوردية والنقدية"
                title="تفاصيل الوردية والنقدية"
              >
                <Wallet className="h-4 w-4" />
                <span
                  className={
                    isOnline
                      ? "h-2 w-2 rounded-full bg-emerald-400"
                      : "h-2 w-2 rounded-full bg-red-400"
                  }
                  aria-hidden
                />
              </button>
              {shiftDetailsOpen ? (
                <div
                  role="dialog"
                  className="absolute end-0 top-full z-50 mt-2 w-72 rounded-2xl border border-slate-700 bg-slate-900 p-3 text-right shadow-2xl"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    تفاصيل الوردية
                  </p>
                  <dl className="mt-2 space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-slate-400">الاتصال</dt>
                      <dd className={isOnline ? "font-semibold text-emerald-300" : "font-semibold text-red-300"}>
                        {isOnline ? "متصل" : "غير متصل"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-slate-400">في القاعدة</dt>
                      <dd className="font-semibold tabular-nums text-white">
                        {productCount.toLocaleString("ar-EG")}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-slate-400">جاهز على الجهاز</dt>
                      <dd className="font-semibold tabular-nums text-white">
                        {catalog.length.toLocaleString("ar-EG")}
                      </dd>
                    </div>
                    {shiftApi.shift ? (
                      <>
                        <div className="flex items-center justify-between gap-3 border-t border-slate-700 pt-2">
                          <dt className="text-slate-400">الوردية بدأت</dt>
                          <dd className="font-semibold text-white">
                            {new Date(shiftApi.shift.startedAt).toLocaleTimeString("ar-EG")}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-slate-400">العهدة</dt>
                          <dd className="font-semibold tabular-nums text-white">
                            {formatEGP(shiftApi.shift.startingCash)}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-slate-400">النقدية</dt>
                          <dd className="font-semibold tabular-nums text-emerald-300">
                            {formatEGP(shiftApi.shift.cashSales ?? 0)}
                          </dd>
                        </div>
                      </>
                    ) : (
                      <p className="border-t border-slate-700 pt-2 text-slate-400">
                        لا توجد وردية مفتوحة
                      </p>
                    )}
                  </dl>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => {
                const next = !posDark;
                setPosDark(next);
                window.localStorage.setItem("pos-theme", next ? "dark" : "light");
              }}
              className="rounded-xl bg-slate-700 px-3 py-2 text-sm font-bold text-white hover:bg-slate-600"
              aria-label={posDark ? "الوضع الفاتح" : "الوضع الداكن"}
            >
              {posDark ? "☀️" : "🌙"}
            </button>
            {!installed && (
              <button
                type="button"
                onClick={() => {
                  if (!installEvent) {
                    setToast("من متصفح كروم: قائمة ⋮ ثم تثبيت برنامج الكاشير");
                    return;
                  }
                  void installEvent.prompt().then(() => {
                    setInstallEvent(null);
                    setInstalled(true);
                  });
                }}
                className="rounded-xl bg-sky-600 px-3 py-2 text-sm font-bold text-white hover:bg-sky-500"
              >
                💻 تثبيت برنامج الكاشير على الجهاز
              </button>
            )}
            <button
              type="button"
              onClick={() => setOrdersOpen(true)}
              className="rounded-xl bg-orange-500 px-3 py-2 text-sm font-bold text-slate-950 hover:bg-orange-400"
            >
              🛵 طلبات الأونلاين ({desk.openOrderCount})
            </button>
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-500"
            >
              💬 شات العملاء ({desk.chatUnread})
            </button>
            <div className="hidden max-w-xs text-right text-sm sm:block">
              {scanError ? (
                <p className="font-medium text-red-300">{scanError}</p>
              ) : scanMessage ? (
                <p className="font-medium text-brand-300">{scanMessage}</p>
              ) : (
                <p className="text-slate-400">أدخل الباركود...</p>
              )}
            </div>
            <button
              type="button"
              disabled={shiftLocked || isClosingShift}
              onClick={handleReturnModeClick}
              className={
                returnMode
                  ? "rounded-xl bg-white px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-50 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-white"
                  : "rounded-xl bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-white"
              }
            >
              {returnMode ? "إنهاء الاسترجاع" : "وضع الاسترجاع"}
            </button>
            <button
              type="button"
              disabled={shiftLocked || isClosingShift}
              onClick={handleOpenDrawer}
              className="rounded-xl bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-600 disabled:cursor-not-allowed disabled:bg-slate-600"
            >
              فتح الدرج
            </button>
            <button
              type="button"
              disabled={shiftLocked || isClosingShift}
              onClick={() => void openZReportModal()}
              className="rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-600"
            >
              تقفيل الكاشير (Z-Report)
            </button>
          </div>
        </header>

        {recentSales.length > 0 && (
          <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-slate-800 bg-slate-950 px-4 py-1.5">
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              السجل
            </span>
            {recentSales.map((sale) => (
              <span
                key={sale.id}
                className="inline-flex shrink-0 items-center gap-2 rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-200"
                title={sale.syncError}
              >
                <SaleSyncStatusBadge status={sale.syncStatus} variant="dark" />
                <span className="tabular-nums">{formatEGP(sale.total)}</span>
                <span className="text-slate-400">
                  {new Date(sale.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </span>
            ))}
          </div>
        )}

        <div className="pos-stage flex min-h-0 flex-1 flex-col md:flex-row">
          <CartPanel
            lines={cart.lines}
            total={payableTotal}
            itemCount={cart.itemCount}
            returnMode={returnMode}
            highlightedItemId={highlightedItemId}
            listRef={cartListRef}
            loyaltyCustomer={selectedCustomer}
            redeemPoints={redeemPoints && !returnMode}
            onToggleRedeem={setRedeemPoints}
            pointsDiscount={pointsDiscount}
            onClearLoyaltyCustomer={() => {
              setSelectedCustomer(null);
              setRedeemPoints(false);
            }}
            onIncrement={cart.increment}
            onDecrement={cart.decrement}
            onAfterQtyChange={focusBarcodeSearch}
            onRemove={handleRemoveLine}
            onUpdateLine={cart.updateLine}
            onClear={() => {
              cart.clear();
              setSelectedCustomer(null);
              setRedeemPoints(false);
              focusBarcodeSearch();
            }}
            onCheckout={() => setCheckoutOpen(true)}
            isCheckingOut={checkout.isSubmitting}
            onHoldCart={holdCurrentCart}
            onOpenHeldCarts={() => setHeldModalOpen(true)}
            heldCartCount={heldCarts.length}
          />
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <ProductGrid
              ref={productGridRef}
              products={catalog}
              categories={[]}
              isLoading={isLoading || shiftApi.isLoading}
              scanLocked={!!notFoundBarcode || priceCheckOpen}
              onOpenPriceCheck={openPriceCheck}
              onAdd={handleAddProduct}
              onBarcodeEnter={handleBarcodeEnter}
            />
            <PosTouchKeyboardHost />
          </div>
        </div>

        <CheckoutDialog
          open={checkoutOpen}
          total={payableTotal}
          isOnline={isOnline}
          isSubmitting={checkout.isSubmitting}
          error={checkout.error}
          customers={customers}
          isReturn={returnMode}
          onClose={() => {
            if (!checkout.isSubmitting) setCheckoutOpen(false);
          }}
          onConfirm={async ({
            paymentMethod,
            customer,
            tendered,
            employeeId,
            employeeName,
          }) => {
            if (!shiftApi.shift) return;
            if (returnMode && !managerAuth) {
              setPendingPin({ type: "return_mode" });
              return;
            }
            const staffMeal = paymentMethod === "STAFF_MEAL";
            const applyLoyalty = !!selectedCustomer && !returnMode && !staffMeal;
            const sale = await checkout.completeSale({
              lines: cart.lines,
              total: applyLoyalty ? payableTotal : cart.total,
              paymentMethod,
              customer,
              tendered,
              employeeId,
              employeeName,
              isOnline,
              shiftId: shiftApi.shift.id,
              isReturn: returnMode,
              cashierId: session?.user?.id ?? null,
              cashierName: session?.user?.name ?? null,
              managerId: managerAuth?.managerId ?? null,
              managerName: managerAuth?.managerName ?? null,
              loyaltyCustomerId: applyLoyalty ? selectedCustomer.id : null,
              loyaltyPhone: applyLoyalty ? selectedCustomer.phone : null,
              loyaltyBalance: applyLoyalty ? selectedCustomer.pointsBalance : 0,
              pointsEarned: applyLoyalty ? Math.floor(payableTotal * 10) : 0,
              pointsRedeemed: applyLoyalty ? pointsDiscount * 1000 : 0,
            });
            if (sale) {
              await shiftApi.refresh();
              const changeNote =
                !sale.isReturn &&
                sale.paymentMethod === "cash" &&
                sale.change > 0
                  ? ` · change ${formatEGP(sale.change)}`
                  : "";
              const syncNote = sale.isReturn
                ? sale.syncStatus === "synced"
                  ? " · stock restored"
                  : sale.syncStatus === "pending"
                    ? " · restock queued"
                    : ""
                : sale.wooOrderId
                  ? ` · WC #${sale.wooOrderId}`
                  : sale.syncStatus === "pending"
                    ? " · queued offline"
                    : "";
              cart.clear();
              setSelectedCustomer(null);
              setRedeemPoints(false);
              setCheckoutOpen(false);
              if (sale.isReturn) {
                disableReturnMode();
                setScanMessage(
                  `Refund ${formatEGP(Math.abs(sale.total))}${syncNote}`,
                );
              } else if (sale.paymentMethod === "STAFF_MEAL") {
                setScanMessage(
                  `Staff meal${sale.employeeName ? ` · ${sale.employeeName}` : ""} · no cash`,
                );
              } else {
                setScanMessage(`Sale complete${changeNote}${syncNote}`);
              }
              // Focus for next customer after print dialog closes (and immediately as fallback).
              focusBarcodeSearch();
              printReceipt(sale, focusBarcodeSearch);
            }
          }}
        />

        <PinAuthorizationModal
          open={!!pendingPin}
          action={pinAction}
          onClose={() => {
            pendingReceiptLines.current = null;
            setPendingPin(null);
          }}
          onVerified={(result) => {
            const action = pendingPin;
            const loaded = pendingReceiptLines.current;
            pendingReceiptLines.current = null;
            setPendingPin(null);
            if (!action) return;

            if (action.type === "return_mode") {
              cart.clear();
              setManagerAuth(result);
              setReturnMode(true);
              if (loaded && loaded.length > 0) {
                cart.replaceLines(loaded);
                setScanMessage(
                  `وضع الاسترجاع · ${action.receiptCode ?? ""} · ${result.managerName}`,
                );
              } else {
                setScanMessage(
                  `Return mode · authorized by ${result.managerName}`,
                );
              }
            } else if (action.type === "delete_item") {
              cart.removeLine(action.lineId);
              setScanMessage(
                `Item removed · authorized by ${result.managerName}`,
              );
            } else if (action.type === "open_drawer") {
              setScanMessage(
                `Drawer opened · authorized by ${result.managerName}`,
              );
            }
          }}
        />

        {notFoundBarcode && (
          <ProductNotFoundModal
            barcode={notFoundBarcode}
            onDismiss={dismissNotFound}
          />
        )}

        <HeldCartsModal
          open={heldModalOpen}
          carts={heldCarts}
          onClose={() => setHeldModalOpen(false)}
          onResume={resumeHeldCart}
          onDiscard={discardHeldCart}
        />

        <PriceCheckModal
          open={priceCheckOpen}
          products={catalog}
          onClose={closePriceCheck}
        />

        <PosOnlineDrawer
          open={ordersOpen}
          orders={desk.orders}
          drivers={desk.drivers}
          onClose={() => setOrdersOpen(false)}
          onChanged={() => void desk.refresh()}
        />
        <PosChatDrawer
          open={chatOpen}
          threads={desk.threads}
          onClose={() => setChatOpen(false)}
          onSent={() => void desk.refresh()}
        />

        {toast && (
          <div
            className="fixed bottom-6 left-1/2 z-[95] max-w-sm -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-3 text-center text-sm font-semibold text-white shadow-lg"
            role="status"
          >
            {toast}
          </div>
        )}

        <ZReportModal
          open={zReportOpen}
          report={zReport}
          isClosing={isClosingShift}
          onClose={() => {
            if (!isClosingShift) setZReportOpen(false);
          }}
          onConfirmClose={confirmCloseRegister}
        />
      </div>

      {receiptNode}
    </>
  );
}

function mergeCatalog(products: CachedProduct[]): CachedProduct[] {
  const builtIn = builtInQuickTapProducts();
  const knownCodes = new Set<string>();

  for (const p of products) {
    const sku = (p.sku ?? "").trim();
    if (sku) knownCodes.add(sku);
    for (const code of getOpBarcodes(p)) {
      knownCodes.add(code.trim());
    }
  }

  const extras = builtIn.filter((p) => !knownCodes.has(p.sku));
  return [...extras, ...products];
}

function toReturnLines(lines: ReceiptLine[], catalog: CachedProduct[]): CartLine[] {
  return lines.map((line) => {
    const absQty = Math.max(0.001, Math.abs(line.qty));
    const absPrice = Math.abs(line.unitPrice);
    const absTotal = Math.abs(line.lineTotal) || absQty * absPrice;
    const known =
      line.wcProductId != null
        ? catalog.find((product) => product.id === line.wcProductId && !product.isPackage)
        : undefined;
    const product: CachedProduct = known
      ? {
          ...known,
          name: line.name,
          nameZh: line.nameZh ?? known.nameZh,
          price: String(absPrice),
          regular_price: String(absPrice),
          sale_price: "",
          on_sale: false,
        }
      : {
          id: line.wcProductId ?? 0,
          name: line.name,
          nameZh: line.nameZh,
          slug: "return-item",
          sku: line.sku,
          price: String(absPrice),
          regular_price: String(absPrice),
          sale_price: "",
          on_sale: false,
          stock_quantity: null,
          stock_status: "instock",
          manage_stock: false,
          categories: [],
          images: [],
          description: "",
          short_description: "",
          status: "publish",
          type: "simple",
          meta_data: [],
          cachedAt: new Date().toISOString(),
          posKey: `return-${line.wcProductId ?? line.name}`,
          isLocal: line.wcProductId == null,
        };
    return {
      lineId:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `return-${Date.now()}-${line.name}`,
      product,
      qty: -absQty,
      unitPrice: -absPrice,
      lineTotal: -absTotal,
      isScalePriced: false,
      isWeighted: false,
    };
  });
}
