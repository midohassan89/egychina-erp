"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

/** Safe EGP formatter — never throws if Intl/locale is incomplete. */
function formatPriceSafe(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat("en-EG", {
      style: "currency",
      currency: "EGP",
      minimumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} EGP`;
  }
}

export default function PriceCheckerKioskPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mounted, setMounted] = useState(false);
  const [buffer, setBuffer] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "result" | "miss">(
    "idle",
  );
  const [result, setResult] = useState<LookupResult | null>(null);

  const clearResetTimer = useCallback(() => {
    if (resetTimerRef.current != null) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  }, []);

  const focusInput = useCallback(() => {
    // Must only run after mount (called from effects / handlers).
    const el = inputRef.current;
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
    } catch {
      try {
        el.focus();
      } catch {
        // ignore
      }
    }
  }, []);

  const returnToIdle = useCallback(() => {
    clearResetTimer();
    setStatus("idle");
    setResult(null);
    setBuffer("");
    // Defer focus to next tick — only after mount.
    setTimeout(() => focusInput(), 0);
  }, [clearResetTimer, focusInput]);

  const scheduleReset = useCallback(() => {
    clearResetTimer();
    resetTimerRef.current = setTimeout(() => {
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
        const token =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("token")
            : null;
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
        setTimeout(() => focusInput(), 0);
      }
    },
    [clearResetTimer, focusInput, scheduleReset],
  );

  // 1) Mark mounted only on the client after hydration.
  useEffect(() => {
    console.log("Price checker mounted");
    setMounted(true);
    return () => {
      clearResetTimer();
    };
  }, [clearResetTimer]);

  // 2) Focus / re-focus ONLY after mounted.
  useEffect(() => {
    if (!mounted) return;

    focusInput();
    const id = setInterval(() => {
      if (
        typeof document !== "undefined" &&
        document.activeElement !== inputRef.current
      ) {
        focusInput();
      }
    }, 1500);

    return () => clearInterval(id);
  }, [mounted, focusInput]);

  // Prevent hydration mismatch: identical null-ish shell until client mount.
  if (!mounted) {
    return (
      <div
        style={{
          minHeight: "100vh",
          width: "100%",
          backgroundColor: "#0b1220",
          color: "#a7f3d0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "1.5rem",
          fontWeight: 700,
        }}
      >
        جاري التحميل…
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      onClick={focusInput}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width: "100%",
        minHeight: "100vh",
        overflow: "hidden",
        backgroundColor: "#0b1220",
        color: "#ffffff",
        userSelect: "none",
      }}
    >
      <div
        aria-hidden
        style={{
          pointerEvents: "none",
          position: "absolute",
          inset: 0,
          zIndex: 0,
          background:
            "radial-gradient(ellipse 80% 55% at 50% 0%, rgba(16,185,129,0.35), transparent 55%), linear-gradient(180deg, #0f172a 0%, #020617 100%)",
        }}
      />

      <input
        ref={inputRef}
        value={buffer}
        onChange={(e) => setBuffer(e.target.value)}
        onBlur={() => {
          setTimeout(focusInput, 30);
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
        spellCheck={false}
        aria-label="Barcode scanner input"
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
        style={{
          position: "relative",
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "1.25rem 1.5rem",
          color: "#ffffff",
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "#34d399",
            }}
          >
            سوق العبور
          </p>
          <h1
            style={{
              margin: "0.15rem 0 0",
              fontSize: "1.15rem",
              fontWeight: 700,
              color: "#ffffff",
            }}
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
            style={{
              borderRadius: "0.75rem",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 700,
              backgroundColor: "rgba(255,255,255,0.15)",
              color: "#fff",
              border: "none",
              cursor: "pointer",
            }}
          >
            مسح الشاشة
          </button>
        )}
      </header>

      <main
        style={{
          position: "relative",
          zIndex: 20,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          color: "#ffffff",
          textAlign: "center",
        }}
      >
        {status === "idle" && (
          <div style={{ maxWidth: "48rem" }}>
            <div
              style={{
                margin: "0 auto 2.5rem",
                width: "9rem",
                height: "9rem",
                borderRadius: "1.5rem",
                border: "1px solid rgba(52,211,153,0.4)",
                backgroundColor: "rgba(16,185,129,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "3.5rem",
              }}
            >
              ⎚
            </div>
            <p
              style={{
                margin: 0,
                fontSize: "clamp(2rem, 6vw, 3.75rem)",
                fontWeight: 800,
                lineHeight: 1.2,
                color: "#ffffff",
              }}
            >
              مرر الباركود لمعرفة السعر
            </p>
            <p
              style={{
                marginTop: "1.25rem",
                fontSize: "clamp(1rem, 2.5vw, 1.25rem)",
                color: "#cbd5e1",
              }}
            >
              Scan the barcode to see the price
            </p>
          </div>
        )}

        {status === "loading" && (
          <p style={{ fontSize: "2rem", fontWeight: 700, color: "#6ee7b7" }}>
            جاري البحث…
          </p>
        )}

        {status === "miss" && result && !result.found && (
          <div style={{ maxWidth: "48rem" }}>
            <p
              style={{
                margin: 0,
                fontSize: "clamp(2.5rem, 7vw, 3.75rem)",
                fontWeight: 800,
                color: "#f87171",
              }}
            >
              المنتج غير موجود
            </p>
            <p
              style={{
                marginTop: "1rem",
                fontFamily: "monospace",
                fontSize: "1.5rem",
                color: "#fecaca",
              }}
            >
              {result.barcode}
            </p>
            <p style={{ marginTop: "2rem", color: "#94a3b8" }}>
              يعاد العرض تلقائياً خلال ثوانٍ…
            </p>
          </div>
        )}

        {status === "result" && result && result.found && (
          <div
            style={{
              width: "100%",
              maxWidth: "64rem",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "2rem",
            }}
          >
            {result.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={result.imageUrl}
                alt=""
                style={{
                  width: "14rem",
                  height: "14rem",
                  borderRadius: "1.5rem",
                  objectFit: "cover",
                }}
              />
            ) : null}
            <h2
              style={{
                margin: 0,
                maxWidth: "56rem",
                fontSize: "clamp(2rem, 6vw, 4rem)",
                fontWeight: 800,
                lineHeight: 1.2,
                color: "#ffffff",
              }}
            >
              {result.name}
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: "clamp(3rem, 10vw, 6rem)",
                fontWeight: 800,
                fontVariantNumeric: "tabular-nums",
                color: "#34d399",
              }}
            >
              {formatPriceSafe(result.price)}
            </p>
            <p style={{ margin: 0, fontSize: "0.875rem", color: "#94a3b8" }}>
              يعود للشاشة الرئيسية خلال ٦ ثوانٍ
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
