"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ScanBarcode } from "lucide-react";
import { formatEGP } from "@/lib/pos/money";

type LookupResult =
  | {
      found: true;
      name: string;
      price: number;
      imageUrl: string | null;
      barcode: string;
    }
  | {
      found: false;
      barcode: string;
      message?: string;
    };

const RESET_MS = 6000;

export default function PriceCheckerKioskPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resetTimerRef = useRef<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [buffer, setBuffer] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "result" | "miss">(
    "idle",
  );
  const [result, setResult] = useState<LookupResult | null>(null);

  const focusInput = useCallback(() => {
    const el = inputRef.current;
    if (!el || typeof document === "undefined") return;
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
  }, []);

  const clearResetTimer = useCallback(() => {
    if (resetTimerRef.current != null) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  }, []);

  const returnToIdle = useCallback(() => {
    clearResetTimer();
    setStatus("idle");
    setResult(null);
    setBuffer("");
    window.requestAnimationFrame(() => focusInput());
  }, [clearResetTimer, focusInput]);

  const scheduleReset = useCallback(() => {
    clearResetTimer();
    resetTimerRef.current = window.setTimeout(() => {
      returnToIdle();
    }, RESET_MS);
  }, [clearResetTimer, returnToIdle]);

  const lookup = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code) return;

      clearResetTimer();
      setStatus("loading");
      setBuffer("");

      try {
        const token = new URLSearchParams(window.location.search).get("token");
        const qs = new URLSearchParams({ barcode: code });
        if (token) qs.set("token", token);

        const res = await fetch(`/api/price-checker/lookup?${qs.toString()}`);
        const body = (await res.json()) as {
          found?: boolean;
          name?: string;
          price?: number;
          imageUrl?: string | null;
          barcode?: string;
          message?: string;
          error?: string;
        };

        if (!res.ok || !body.found || body.name == null || body.price == null) {
          setResult({
            found: false,
            barcode: code,
            message: body.message ?? body.error ?? "Product not found",
          });
          setStatus("miss");
          scheduleReset();
          return;
        }

        setResult({
          found: true,
          name: body.name,
          price: body.price,
          imageUrl: body.imageUrl ?? null,
          barcode: body.barcode ?? code,
        });
        setStatus("result");
        scheduleReset();
      } catch (err) {
        console.error("[price-checker] lookup failed", err);
        setResult({
          found: false,
          barcode: code,
          message: "تعذر الاتصال — حاول مرة أخرى",
        });
        setStatus("miss");
        scheduleReset();
      } finally {
        focusInput();
      }
    },
    [clearResetTimer, focusInput, scheduleReset],
  );

  // Mount gate — only touch the DOM after the client has hydrated.
  useEffect(() => {
    console.log("Price checker mounted");
    setMounted(true);
  }, []);

  // Auto-focus + re-focus on blur (after mount only).
  useEffect(() => {
    if (!mounted) return;

    focusInput();
    const id = window.setInterval(() => {
      if (document.activeElement !== inputRef.current) {
        focusInput();
      }
    }, 1500);

    return () => window.clearInterval(id);
  }, [mounted, focusInput]);

  useEffect(() => {
    return () => clearResetTimer();
  }, [clearResetTimer]);

  return (
    <div
      className="relative flex h-full min-h-screen w-full flex-col overflow-hidden text-white"
      style={{
        backgroundColor: "#0b1220",
        color: "#ffffff",
        minHeight: "100dvh",
      }}
      onClick={() => {
        if (mounted) focusInput();
      }}
      dir="rtl"
    >
      {/* Atmosphere — keep below content via z-index */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 55% at 50% 0%, rgba(16,185,129,0.35), transparent 55%), linear-gradient(180deg, #0f172a 0%, #020617 100%)",
        }}
      />

      {/* Scanner capture — off-screen but focusable (not opacity-0 + pointer-events-none) */}
      <input
        ref={inputRef}
        value={buffer}
        onChange={(e) => setBuffer(e.target.value)}
        onBlur={() => {
          if (!mounted) return;
          window.setTimeout(focusInput, 30);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const value = buffer;
            setBuffer("");
            void lookup(value);
          }
        }}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label="Barcode scanner input"
        className="absolute"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 1,
          height: 1,
          opacity: 0.01,
          zIndex: 1,
          border: "none",
          padding: 0,
          margin: 0,
        }}
      />

      <header
        className="relative z-20 flex shrink-0 items-center justify-between px-6 py-5 sm:px-10"
        style={{ color: "#ffffff" }}
      >
        <div>
          <p
            className="text-sm font-semibold tracking-wide"
            style={{ color: "#34d399" }}
          >
            سوق العبور
          </p>
          <h1
            className="text-lg font-bold sm:text-xl"
            style={{ color: "#ffffff" }}
          >
            استعلام السعر · Price Checker
          </h1>
        </div>
        {status !== "idle" && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              returnToIdle();
            }}
            className="rounded-xl px-4 py-2 text-sm font-bold"
            style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "#fff" }}
          >
            مسح الشاشة
          </button>
        )}
      </header>

      <main
        className="relative z-20 flex min-h-0 flex-1 flex-col items-center justify-center px-6 pb-16 sm:px-10"
        style={{ color: "#ffffff" }}
      >
        {!mounted && (
          <p className="text-2xl font-bold" style={{ color: "#a7f3d0" }}>
            جاري التحميل…
          </p>
        )}

        {mounted && status === "idle" && (
          <div className="flex max-w-3xl flex-col items-center text-center">
            <div
              className="kiosk-scan-pulse mb-10 flex h-36 w-36 items-center justify-center rounded-3xl sm:h-44 sm:w-44"
              style={{
                border: "1px solid rgba(52,211,153,0.4)",
                backgroundColor: "rgba(16,185,129,0.15)",
              }}
            >
              <ScanBarcode
                className="h-20 w-20 sm:h-24 sm:w-24"
                style={{ color: "#34d399" }}
                strokeWidth={1.75}
              />
            </div>
            <p
              className="text-4xl font-extrabold leading-tight sm:text-5xl md:text-6xl"
              style={{ color: "#ffffff" }}
            >
              مرر الباركود لمعرفة السعر
            </p>
            <p
              className="mt-5 text-lg sm:text-xl"
              style={{ color: "#cbd5e1" }}
            >
              Scan the barcode to see the price
            </p>
          </div>
        )}

        {mounted && status === "loading" && (
          <p
            className="text-3xl font-bold sm:text-4xl"
            style={{ color: "#6ee7b7" }}
          >
            جاري البحث…
          </p>
        )}

        {mounted && status === "miss" && result && !result.found && (
          <div className="flex max-w-3xl flex-col items-center text-center">
            <p
              className="text-5xl font-extrabold sm:text-6xl"
              style={{ color: "#f87171" }}
            >
              المنتج غير موجود
            </p>
            <p
              className="mt-4 font-mono text-2xl"
              style={{ color: "#fecaca" }}
            >
              {result.barcode}
            </p>
            <p className="mt-8" style={{ color: "#94a3b8" }}>
              يعاد العرض تلقائياً خلال ثوانٍ…
            </p>
          </div>
        )}

        {mounted && status === "result" && result && result.found && (
          <div className="flex w-full max-w-5xl flex-col items-center gap-8 text-center">
            {result.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={result.imageUrl}
                alt=""
                className="h-48 w-48 rounded-3xl object-cover shadow-2xl sm:h-56 sm:w-56"
              />
            ) : (
              <div
                className="flex h-40 w-40 items-center justify-center rounded-3xl"
                style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
              >
                <ScanBarcode
                  className="h-16 w-16"
                  style={{ color: "#64748b" }}
                />
              </div>
            )}
            <h2
              className="max-w-4xl text-4xl font-extrabold leading-tight sm:text-5xl md:text-6xl lg:text-7xl"
              style={{ color: "#ffffff" }}
            >
              {result.name}
            </h2>
            <p
              className="text-6xl font-extrabold tabular-nums tracking-tight sm:text-7xl md:text-8xl lg:text-9xl"
              style={{ color: "#34d399" }}
            >
              {formatEGP(result.price)}
            </p>
            <p className="text-sm" style={{ color: "#94a3b8" }}>
              يعود للشاشة الرئيسية خلال ٦ ثوانٍ
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
