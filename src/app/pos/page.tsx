"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { getCachedCustomers } from "@/lib/cache/indexeddb";
import { useCart } from "@/hooks/useCart";
import { useCatalogSync } from "@/hooks/useCatalogSync";
import { useCheckout } from "@/hooks/useCheckout";
import { useReceiptPrint } from "@/hooks/useReceiptPrint";
import { useShift } from "@/hooks/useShift";
import { builtInQuickTapProducts } from "@/lib/pos/scaleCatalog";
import { getOpBarcodes } from "@/lib/pos/opBarcode";
import { resolveScannedBarcode } from "@/lib/pos/resolveBarcode";
import { formatEGP } from "@/lib/pos/money";
import { CartPanel, cartItemDomId } from "@/components/pos/CartPanel";
import { CheckoutDialog } from "@/components/pos/CheckoutDialog";
import {
  PinAuthorizationModal,
  type PinAuthAction,
} from "@/components/pos/PinAuthorizationModal";
import {
  ProductGrid,
  type ProductGridHandle,
} from "@/components/pos/ProductGrid";
import { ShiftStartScreen } from "@/components/pos/ShiftStartScreen";
import { ZReportModal } from "@/components/pos/ZReportModal";
import { PosKeyboardProvider, usePosKeyboard } from "@/components/pos/PosKeyboardContext";
import { PosTouchKeyboardHost } from "@/components/pos/PosTouchKeyboard";
import { isManagerOrAdmin } from "@/lib/auth/roles";
import type {
  CachedCustomer,
  CachedProduct,
  ZReportSummary,
} from "@/types/woocommerce";

type PendingPinAction =
  | { type: "return_mode" }
  | { type: "delete_item"; lineId: string }
  | { type: "open_drawer" };

export default function POSPage() {
  return (
    <PosKeyboardProvider>
      <POSPageInner />
      <PosTouchKeyboardHost />
    </PosKeyboardProvider>
  );
}

function POSPageInner() {
  const { data: session } = useSession();
  const { insetStyle } = usePosKeyboard();
  const { products, productCount, isLoading, isOnline } = useCatalogSync();
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
  const [highlightedItemId, setHighlightedItemId] = useState<number | null>(
    null,
  );
  const cartListRef = useRef<HTMLDivElement | null>(null);
  const productGridRef = useRef<ProductGridHandle | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const scrollTimerRef = useRef<number | null>(null);

  const focusBarcodeSearch = useCallback(() => {
    window.setTimeout(() => {
      productGridRef.current?.focusSearch();
    }, 50);
  }, []);

  const catalog = useMemo(() => mergeCatalog(products), [products]);
  const shiftLocked = !shiftApi.isLoading && !shiftApi.isOpen;

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

  const flashCartItem = useCallback((productId: number, isNew: boolean) => {
    setHighlightedItemId(productId);
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
        .getElementById(cartItemDomId(productId))
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }, []);

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

  const handleBarcodeEnter = useCallback(
    (rawInput: string): boolean => {
      if (shiftLocked) return false;

      const result = resolveScannedBarcode(rawInput, catalog);

      if ("error" in result) {
        setScanError(result.error);
        setScanMessage(null);
        return false;
      }

      if (result.isWeighted || result.isScalePriced) {
        cart.addScaleLine({
          product: result.product,
          customTotal: result.lineTotal,
          barcode: result.barcode,
          plu: result.plu,
        });
        // Scale lines are always appended as new rows.
        flashCartItem(result.product.id, true);
        setScanMessage(
          returnMode
            ? `Return ${result.product.name} · ${formatEGP(-Math.abs(result.lineTotal))}`
            : `Added ${result.product.name} · ${formatEGP(result.lineTotal)}`,
        );
      } else {
        const existingItem = cart.lines.find(
          (item) =>
            item.product.id === result.product.id && !item.isScalePriced,
        );
        cart.addProduct(result.product, 1);
        flashCartItem(result.product.id, !existingItem);
        setScanMessage(
          returnMode
            ? `Return ${result.product.name}`
            : `Added ${result.product.name}`,
        );
      }

      setScanError(null);
      return true;
    },
    [
      catalog,
      cart.lines,
      cart.addProduct,
      cart.addScaleLine,
      shiftLocked,
      returnMode,
      flashCartItem,
    ],
  );

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

  return (
    <>
      {shiftLocked && (
        <ShiftStartScreen
          onOpen={async (cash) => {
            await shiftApi.openShift(cash);
          }}
        />
      )}

      <div className="pos-no-print flex h-full min-h-0 flex-col overflow-hidden bg-slate-200 select-none">
        <header
          className={
            returnMode
              ? "flex shrink-0 items-center justify-between gap-3 border-b border-red-800 bg-red-950 px-4 py-3 text-white"
              : "flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3 text-white"
          }
        >
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">
              Souq El Obour - POS
              {returnMode ? " · وضع الاسترجاع" : ""}
            </h1>
            <p className="mt-0.5 text-xs text-slate-400 sm:text-sm">
              {isOnline ? "Online" : "Offline"} · {productCount} in DB ·{" "}
              {catalog.length} ready
              {shiftApi.shift
                ? ` · shift since ${new Date(shiftApi.shift.startedAt).toLocaleTimeString()} · float ${formatEGP(shiftApi.shift.startingCash)} · cash ${formatEGP(shiftApi.shift.cashSales ?? 0)}`
                : ""}
              {returnMode && managerAuth
                ? ` · auth ${managerAuth.managerName}`
                : ""}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden max-w-xs text-right text-sm sm:block">
              {scanError ? (
                <p className="font-medium text-red-300">{scanError}</p>
              ) : scanMessage ? (
                <p className="font-medium text-brand-300">{scanMessage}</p>
              ) : (
                <p className="text-slate-400">Type barcode + Enter</p>
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
              {returnMode ? "Exit Return" : "وضع الاسترجاع"}
            </button>
            <button
              type="button"
              disabled={shiftLocked || isClosingShift}
              onClick={handleOpenDrawer}
              className="rounded-xl bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-600 disabled:cursor-not-allowed disabled:bg-slate-600"
            >
              Open Drawer
            </button>
            <button
              type="button"
              disabled={shiftLocked || isClosingShift}
              onClick={() => void openZReportModal()}
              className="rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-600"
            >
              Close Register (Z-Report)
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <CartPanel
            lines={cart.lines}
            total={cart.total}
            itemCount={cart.itemCount}
            returnMode={returnMode}
            highlightedItemId={highlightedItemId}
            listRef={cartListRef}
            onIncrement={cart.increment}
            onDecrement={cart.decrement}
            onRemove={handleRemoveLine}
            onUpdateLine={cart.updateLine}
            onClear={() => {
              cart.clear();
              focusBarcodeSearch();
            }}
            onCheckout={() => setCheckoutOpen(true)}
            isCheckingOut={checkout.isSubmitting}
          />
          <div
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
            style={insetStyle}
          >
            <ProductGrid
              ref={productGridRef}
              products={catalog}
              categories={[]}
              isLoading={isLoading || shiftApi.isLoading}
              onAdd={(product) => {
                const existingItem = cart.lines.find(
                  (item) =>
                    item.product.id === product.id && !item.isScalePriced,
                );
                cart.addProduct(product);
                flashCartItem(product.id, !existingItem);
              }}
              onBarcodeEnter={handleBarcodeEnter}
            />
          </div>
        </div>

        <CheckoutDialog
          open={checkoutOpen}
          total={cart.total}
          isOnline={isOnline}
          isSubmitting={checkout.isSubmitting}
          error={checkout.error}
          customers={customers}
          isReturn={returnMode}
          onClose={() => {
            if (!checkout.isSubmitting) setCheckoutOpen(false);
          }}
          onConfirm={async ({ paymentMethod, customer, tendered }) => {
            if (!shiftApi.shift) return;
            if (returnMode && !managerAuth) {
              setPendingPin({ type: "return_mode" });
              return;
            }
            const sale = await checkout.completeSale({
              lines: cart.lines,
              total: cart.total,
              paymentMethod,
              customer,
              tendered,
              isOnline,
              shiftId: shiftApi.shift.id,
              isReturn: returnMode,
              cashierId: session?.user?.id ?? null,
              cashierName: session?.user?.name ?? null,
              managerId: managerAuth?.managerId ?? null,
              managerName: managerAuth?.managerName ?? null,
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
              setCheckoutOpen(false);
              if (sale.isReturn) {
                disableReturnMode();
                setScanMessage(
                  `Refund ${formatEGP(Math.abs(sale.total))}${syncNote}`,
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
          onClose={() => setPendingPin(null)}
          onVerified={(result) => {
            const action = pendingPin;
            setPendingPin(null);
            if (!action) return;

            if (action.type === "return_mode") {
              cart.clear();
              setManagerAuth(result);
              setReturnMode(true);
              setScanMessage(
                `Return mode · authorized by ${result.managerName}`,
              );
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
