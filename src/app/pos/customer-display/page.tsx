"use client";

import { useEffect, useRef, useState } from "react";
import { formatEGP, formatQty } from "@/lib/pos/money";
import {
  CFD_COMPLETED_MS,
  emptyCustomerDisplayState,
  publishCustomerDisplayState,
  subscribeCustomerDisplayState,
  type CustomerDisplayState,
} from "@/lib/pos/customerDisplaySync";

const CFD_HIGHLIGHT_MS = 3_500;
const CFD_PLACEHOLDER_IMG = "/logos/logo-ar.svg";
/** Static WeChat Pay QR — place the file under public/uploads/images/. */
const WECHAT_QR_SRC = "/uploads/images/wechat-qr.jpg";
/** Static InstaPay QR — place the file under public/uploads/images/. */
const INSTAPAY_QR_SRC = "/uploads/images/instapay-qr.jpeg";

function isWeChatDisplayMethod(
  method?: string | null,
  methodLabel?: string | null,
): boolean {
  return (
    method === "wechat" ||
    method === "WECHAT" ||
    !!methodLabel?.includes("وي شات")
  );
}

function isInstaPayDisplayMethod(
  method?: string | null,
  methodLabel?: string | null,
): boolean {
  return (
    method === "instapay" ||
    method === "INSTAPAY" ||
    !!methodLabel?.includes("انستا")
  );
}

function isQrPaymentDisplayMethod(
  method?: string | null,
  methodLabel?: string | null,
): boolean {
  return (
    isWeChatDisplayMethod(method, methodLabel) ||
    isInstaPayDisplayMethod(method, methodLabel)
  );
}

function PaymentQrPanel({
  variant,
}: {
  variant: "wechat" | "instapay";
}) {
  const isInstapay = variant === "instapay";
  return (
    <div
      className="flex w-[350px] shrink-0 animate-zoom-fade-in flex-col items-center justify-center rounded-3xl bg-white p-5 text-center shadow-lg [animation-duration:500ms] sm:p-6"
      dir="ltr"
    >
      {isInstapay ? (
        <>
          <p
            className="mb-2 break-words text-sm font-bold sm:text-base"
            style={{ color: "#5b2b8c" }}
          >
            امسح الكود للدفع عبر إنستا باي
          </p>
          <p className="mb-4 break-words text-xs font-semibold text-slate-500 sm:text-sm">
            Scan to Pay · InstaPay
          </p>
          <img
            src={INSTAPAY_QR_SRC}
            alt="InstaPay QR"
            className="h-64 w-64 max-w-full rounded-2xl bg-white object-contain shadow-lg"
          />
          <div className="mt-6 flex w-full flex-col items-center justify-center gap-1 border-t border-gray-100 pt-4">
            <span className="text-lg font-medium text-gray-500">
              أو التحويل على الرقم:
            </span>
            <span
              className="text-3xl font-bold tracking-wider text-[#5b2b8c]"
              dir="ltr"
            >
              01028009271
            </span>
          </div>
        </>
      ) : (
        <>
          <p className="mb-2 break-words text-sm font-bold text-slate-800 sm:text-base">
            امسح الكود للدفع / Scan to Pay
          </p>
          <p
            className="mb-4 break-words text-sm font-semibold text-emerald-700 sm:text-base"
            lang="zh-CN"
          >
            请扫码付款
          </p>
          <img
            src={WECHAT_QR_SRC}
            alt="WeChat Pay QR"
            className="h-64 w-64 max-w-full rounded-2xl bg-white object-contain shadow-lg"
          />
        </>
      )}
    </div>
  );
}

function cartItemDomId(lineId: string): string {
  return `cart-item-${lineId}`;
}

/** Numerals ordered for clock positions starting at 12, then 1…11. */
const CLOCK_NUMERALS = [
  ["١٢", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩", "١٠", "١١"],
  ["12", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"],
  ["十二", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一"],
] as const;

function clockAnglesNow() {
  const time = new Date();
  return {
    seconds: (time.getSeconds() + time.getMilliseconds() / 1000) * 6,
    minutes: (time.getMinutes() + time.getSeconds() / 60) * 6,
    hours: ((time.getHours() % 12) + time.getMinutes() / 60) * 30,
  };
}

/**
 * Analog clock: static SVG face + div hands updated via refs.
 * Zero React re-renders per frame (no useState in rAF).
 */
function AnalogClock({
  className = "",
  langIndex = 0,
  numerals,
}: {
  className?: string;
  langIndex?: number;
  numerals?: readonly string[];
}) {
  const hourRef = useRef<HTMLDivElement>(null);
  const minuteRef = useRef<HTMLDivElement>(null);
  const secondRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    const apply = () => {
      const { hours, minutes, seconds } = clockAnglesNow();
      if (hourRef.current) {
        hourRef.current.style.transform = `rotate(${hours}deg)`;
      }
      if (minuteRef.current) {
        minuteRef.current.style.transform = `rotate(${minutes}deg)`;
      }
      if (secondRef.current) {
        secondRef.current.style.transform = `rotate(${seconds}deg)`;
      }
    };

    const tick = () => {
      apply();
      frame = window.requestAnimationFrame(tick);
    };

    apply();
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const hourMarks = Array.from({ length: 12 }, (_, i) => i);
  const activeNumerals =
    numerals ?? CLOCK_NUMERALS[langIndex] ?? CLOCK_NUMERALS[0];
  const numeralFontSize = langIndex === 2 ? 12 : 14;

  return (
    <div className={`relative z-10 flex flex-col items-center ${className}`}>
      <div className="relative h-32 w-32 sm:h-40 sm:w-40 md:h-48 md:w-48 lg:h-56 lg:w-56">
        <svg
          viewBox="0 0 200 200"
          className="h-full w-full drop-shadow-2xl"
          aria-hidden
        >
          <circle
            cx="100"
            cy="100"
            r="96"
            fill="rgba(255,255,255,0.12)"
            stroke="rgba(255,255,255,0.45)"
            strokeWidth="3"
          />
          <circle cx="100" cy="100" r="86" fill="rgba(6,78,59,0.55)" />
          {hourMarks.map((mark) => {
            const angle = mark * 30;
            return (
              <line
                key={mark}
                x1="100"
                y1="16"
                x2="100"
                y2={mark % 3 === 0 ? "24" : "21"}
                stroke="rgba(255,255,255,0.75)"
                strokeWidth={mark % 3 === 0 ? 2.5 : 1.25}
                strokeLinecap="round"
                transform={`rotate(${angle} 100 100)`}
              />
            );
          })}
          <g key={`numerals-${langIndex}`}>
            {activeNumerals.map((label, index) => {
              const angleRad = ((index * 30 - 90) * Math.PI) / 180;
              const radius = 68;
              const x = Number((100 + radius * Math.cos(angleRad)).toFixed(3));
              const y = Number((100 + radius * Math.sin(angleRad)).toFixed(3));
              return (
                <text
                  key={`${langIndex}-${index}`}
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="rgba(255,255,255,0.82)"
                  fontSize={numeralFontSize}
                  fontWeight="600"
                  style={{ fontFamily: "system-ui, sans-serif" }}
                >
                  {label}
                </text>
              );
            })}
          </g>
        </svg>

        {/* Hands: no initial transform in SSR — rAF applies angles after mount */}
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div
            ref={hourRef}
            className="absolute inset-0 origin-center"
            style={{ transformOrigin: "center" }}
          >
            <div className="absolute left-1/2 top-[28%] bottom-1/2 w-[5.5px] -translate-x-1/2 rounded-full bg-slate-50" />
          </div>
          <div
            ref={minuteRef}
            className="absolute inset-0 origin-center"
            style={{ transformOrigin: "center" }}
          >
            <div className="absolute left-1/2 top-[18%] bottom-1/2 w-[3.5px] -translate-x-1/2 rounded-full bg-white" />
          </div>
          <div
            ref={secondRef}
            className="absolute inset-0 origin-center"
            style={{ transformOrigin: "center" }}
          >
            <div className="absolute left-1/2 top-[14%] bottom-[42%] w-[2px] -translate-x-1/2 rounded-full bg-amber-500" />
            <div className="absolute left-1/2 top-1/2 bottom-[38%] w-[2px] -translate-x-1/2 rounded-full bg-amber-500" />
          </div>
          <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500 shadow" />
          <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-50" />
        </div>
      </div>
    </div>
  );
}

function BilingualLabel({
  ar,
  zh,
  arClassName = "text-base font-bold md:text-lg",
  zhClassName = "text-xs font-semibold text-emerald-200/80 md:text-sm",
}: {
  ar: string;
  zh: string;
  arClassName?: string;
  zhClassName?: string;
}) {
  return (
    <div className="min-w-0">
      <p className={`${arClassName} whitespace-normal break-words`}>{ar}</p>
      <p className={`${zhClassName} whitespace-normal break-words`} lang="zh-CN" dir="ltr">
        {zh}
      </p>
    </div>
  );
}

const IDLE_BRANDS = [
  "إيجي شاينا هايبر ماركت",
  "EgyChina Hypermarket",
  "易及中国大卖场",
] as const;
const IDLE_BRANCHES = ["سوق العبور", "Souq El Obour", "欧布尔市场"] as const;
const IDLE_GREETINGS = ["مرحباً بكم", "Welcome", "欢迎光临"] as const;
const IDLE_LOCALES = ["ar-EG", "en-US", "zh-CN"] as const;
const IDLE_LANG_ATTR = ["ar", "en", "zh-CN"] as const;
const IDLE_LANG_DIR = ["rtl", "ltr", "ltr"] as const;
const IDLE_ROTATE_MS = 4_000;

function formatIdleDate(locale: string, date = new Date()): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function IdleScreen() {
  const [langIndex, setLangIndex] = useState(0);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const rotate = window.setInterval(() => {
      setLangIndex((prev) => (prev + 1) % 3);
    }, IDLE_ROTATE_MS);
    return () => window.clearInterval(rotate);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const brand = IDLE_BRANDS[langIndex] ?? IDLE_BRANDS[0];
  const branch = IDLE_BRANCHES[langIndex] ?? IDLE_BRANCHES[0];
  const greeting = IDLE_GREETINGS[langIndex] ?? IDLE_GREETINGS[0];
  const locale = IDLE_LOCALES[langIndex] ?? IDLE_LOCALES[0];
  const langAttr = IDLE_LANG_ATTR[langIndex] ?? "ar";
  const dir = IDLE_LANG_DIR[langIndex] ?? "rtl";
  const dateLabel = formatIdleDate(locale, now);
  const numerals = CLOCK_NUMERALS[langIndex] ?? CLOCK_NUMERALS[0];

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden px-4 py-3 text-center sm:px-8 sm:py-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 20%, rgba(16,185,129,0.28), transparent 60%), linear-gradient(165deg, #052e1f 0%, #0b3d2e 42%, #071a14 100%)",
        }}
      />

      <div className="relative z-10 flex shrink-0 flex-col items-center">
        <img
          src="/logos/logo-ar.svg"
          alt="ايجي شاينا هايبر ماركت"
          className="h-14 w-auto max-w-[min(88vw,16rem)] animate-pulse rounded-2xl bg-white object-contain px-3 py-2 shadow-2xl sm:h-20 md:h-24 lg:h-28"
        />
      </div>

      <div
        key={langIndex}
        className="relative z-10 flex min-h-0 flex-1 animate-fade-in flex-col"
        lang={langAttr}
        dir={dir}
      >
        <div className="flex shrink-0 flex-col items-center pt-2">
          <h1 className="max-w-[90vw] whitespace-normal break-words text-xl font-black tracking-tight text-white sm:text-2xl md:text-3xl lg:text-4xl">
            {brand}
          </h1>
          <p className="mt-0.5 text-sm font-semibold text-emerald-200 sm:text-base md:text-xl">
            {branch}
          </p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 py-2 sm:gap-4">
          <AnalogClock langIndex={langIndex} numerals={numerals} />
          <div className="flex min-h-[2.5rem] items-center justify-center px-3">
            <p
              className="whitespace-normal break-words text-sm font-semibold text-emerald-100 sm:text-base md:text-lg lg:text-xl"
              suppressHydrationWarning
            >
              {dateLabel}
            </p>
          </div>
        </div>

        <div className="flex min-h-[3.25rem] shrink-0 items-center justify-center pb-1 sm:min-h-[3.75rem]">
          <p className="whitespace-normal break-words text-xl font-bold text-white sm:text-2xl md:text-3xl lg:text-4xl">
            {greeting}
          </p>
        </div>
      </div>
    </div>
  );
}

function PaymentSummaryRows({
  total,
  paidAmount,
  changeAmount,
  methodLabel,
  paymentMethod,
  exchangeRate,
  tone = "dark",
  size = "default",
}: {
  total: number;
  paidAmount: number;
  changeAmount: number;
  methodLabel?: string | null;
  paymentMethod?: string | null;
  exchangeRate?: number | null;
  tone?: "dark" | "light";
  size?: "default" | "hero";
}) {
  const hero = size === "hero";
  const labelMain =
    tone === "dark" ? "text-white" : "text-emerald-950";
  const labelMuted =
    tone === "dark" ? "text-slate-300" : "text-slate-600";
  const zhMuted =
    tone === "dark" ? "text-slate-400" : "text-slate-500";
  const valueMain =
    tone === "dark" ? "text-white" : "text-emerald-950";
  const valuePaid =
    tone === "dark" ? "text-slate-200" : "text-slate-700";

  const wechat = isWeChatDisplayMethod(paymentMethod, methodLabel);
  const instapay = isInstaPayDisplayMethod(paymentMethod, methodLabel);
  const rate =
    typeof exchangeRate === "number" &&
    Number.isFinite(exchangeRate) &&
    exchangeRate > 0
      ? exchangeRate
      : null;
  const cnyAmount = wechat && rate ? total / rate : null;

  // WeChat / InstaPay: amount-only next to QR — no tendered/change rows.
  // CNY line is WeChat-only; InstaPay stays EGP-only.
  if (wechat || instapay) {
    return (
      <div className="flex min-w-0 w-full flex-col items-center gap-4 text-center sm:gap-6">
        <div className="min-w-0 w-full">
          <p
            className={`break-words font-bold ${hero ? "text-xl sm:text-2xl md:text-3xl" : "text-base md:text-xl"} ${labelMain}`}
          >
            المبلغ المطلوب
          </p>
          {wechat ? (
            <p
              className={`mt-1 break-words opacity-80 ${hero ? "text-base sm:text-lg" : "text-sm"} ${zhMuted}`}
              lang="zh-CN"
              dir="ltr"
            >
              总金额
            </p>
          ) : (
            <p
              className={`mt-1 break-words opacity-80 ${hero ? "text-base sm:text-lg" : "text-sm"} ${zhMuted}`}
              dir="ltr"
            >
              Amount due
            </p>
          )}
        </div>
        <div className="flex w-full min-w-0 justify-center">
          <p
            className={`whitespace-nowrap font-black tabular-nums leading-none ${hero ? "text-4xl lg:text-5xl xl:text-6xl" : "text-3xl lg:text-4xl"} ${valueMain}`}
          >
            {formatEGP(total)}
          </p>
        </div>
        {wechat && cnyAmount != null ? (
          <div className="flex w-full min-w-0 flex-col items-center" dir="ltr">
            <p
              className={`whitespace-nowrap font-black tabular-nums text-amber-400 ${hero ? "text-3xl lg:text-4xl xl:text-5xl" : "text-2xl lg:text-3xl"}`}
            >
              ≈ ¥ {cnyAmount.toFixed(2)}
            </p>
            <p
              className={`mt-1 whitespace-nowrap font-semibold text-amber-300/90 ${hero ? "text-sm sm:text-base md:text-lg" : "text-xs md:text-sm"}`}
              lang="zh-CN"
            >
              人民币 ¥ {cnyAmount.toFixed(2)}
            </p>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${hero ? "gap-6 sm:gap-8" : "gap-3 sm:gap-4"}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p
            className={`break-words ${hero ? "text-2xl font-bold md:text-4xl" : "text-base font-bold md:text-2xl"} ${labelMain}`}
          >
            المبلغ المطلوب
          </p>
          <p
            className={`break-words ${hero ? "mt-1 text-lg md:text-2xl" : "text-sm"} opacity-80 ${zhMuted}`}
            lang="zh-CN"
            dir="ltr"
          >
            总金额
          </p>
        </div>
        <p
          className={`min-w-0 shrink break-words text-end font-bold tabular-nums ${hero ? "text-4xl md:text-5xl" : "text-2xl md:text-3xl"} ${valueMain}`}
        >
          {formatEGP(total)}
        </p>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p
            className={`break-words ${hero ? "text-xl font-semibold md:text-3xl" : "text-sm font-semibold md:text-lg"} ${labelMuted}`}
          >
            النقدية المستلمة
            {methodLabel ? ` · ${methodLabel}` : ""}
          </p>
          <p
            className={`break-words ${hero ? "mt-1 text-base md:text-xl" : "text-sm"} opacity-80 ${zhMuted}`}
            lang="zh-CN"
            dir="ltr"
          >
            收款金额
          </p>
        </div>
        <p
          className={`min-w-0 shrink break-words text-end font-bold tabular-nums ${hero ? "text-3xl md:text-4xl" : "text-xl md:text-2xl"} ${valuePaid}`}
        >
          {formatEGP(paidAmount)}
        </p>
      </div>

      <div
        className={`rounded-2xl bg-green-600 text-white ${hero ? "px-5 py-5 sm:px-8 sm:py-7" : "px-3 py-3 sm:px-4 sm:py-4"}`}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p
              className={`break-words ${hero ? "text-xl font-bold md:text-3xl" : "text-sm font-bold md:text-lg"}`}
            >
              الباقي للعميل
            </p>
            <p
              className={
                hero
                  ? "mt-1 break-words text-base text-emerald-100/90 md:text-xl"
                  : "break-words text-sm text-emerald-100/90"
              }
              lang="zh-CN"
              dir="ltr"
            >
              找零
            </p>
          </div>
          <p
            className={`min-w-0 shrink break-words text-end font-black tabular-nums ${hero ? "text-4xl md:text-5xl lg:text-6xl" : "text-2xl md:text-4xl"}`}
          >
            {formatEGP(Math.max(0, changeAmount))}
          </p>
        </div>
      </div>
    </div>
  );
}

function CompletedScreen({ state }: { state: CustomerDisplayState }) {
  const sale = state.lastCompletedSale;
  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center overflow-hidden p-8 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 30%, rgba(52,211,153,0.35), transparent 55%), linear-gradient(180deg, #064e3b 0%, #022c22 100%)",
        }}
      />
      <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400 text-3xl font-black text-emerald-950 shadow-xl sm:h-20 sm:w-20 sm:text-5xl">
        ✓
      </div>
      <h1 className="relative z-10 mt-4 max-w-[92vw] whitespace-normal break-words text-2xl font-black text-white md:mt-6 md:text-3xl lg:text-5xl">
        شكراً لتسوقكم من إيجي شاينا هايبر ماركت
      </h1>
      <p className="relative z-10 mt-2 text-base text-emerald-100 md:text-xl lg:text-2xl" dir="ltr">
        Thank you for shopping with us
      </p>
      {sale ? (
        <div className="relative z-10 mt-6 w-full max-w-4xl rounded-3xl bg-white/10 p-6 text-start text-white backdrop-blur sm:mt-10 sm:p-10">
          <div className="mb-6 flex items-center justify-between gap-4 text-xl md:text-3xl">
            <span className="text-emerald-100">رقم الفاتورة</span>
            <span className="font-black tabular-nums" dir="ltr">
              {sale.orderNumber}
            </span>
          </div>
          <PaymentSummaryRows
            total={sale.total}
            paidAmount={sale.paidAmount}
            changeAmount={sale.changeAmount}
            paymentMethod={sale.paymentMethod}
            exchangeRate={sale.exchangeRate}
            tone="dark"
            size="hero"
          />
        </div>
      ) : null}
    </div>
  );
}

const HIDDEN_SCROLLBAR =
  "min-h-0 flex-1 overflow-y-auto px-2 py-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]";

function ProductThumb({
  src,
  alt,
}: {
  src?: string | null;
  alt: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = !failed && src?.trim() ? src.trim() : CFD_PLACEHOLDER_IMG;
  return (
    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-white sm:h-16 sm:w-16">
      <img
        src={url}
        alt={alt}
        className="h-full w-full object-contain p-0.5"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function ShoppingScreen({ state }: { state: CustomerDisplayState }) {
  const [highlightLineId, setHighlightLineId] = useState<string | null>(null);
  const isShopping = state.mode === "SHOPPING";
  const isPayment = state.mode === "PAYMENT" && !!state.payment;

  useEffect(() => {
    if (!isShopping) {
      setHighlightLineId(null);
      return;
    }
    const lineId = state.lastUpdatedItem?.lineId;
    if (!lineId) {
      setHighlightLineId(null);
      return;
    }
    setHighlightLineId(lineId);
    const timer = window.setTimeout(() => setHighlightLineId(null), CFD_HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [isShopping, state.lastUpdatedItem?.updatedAt, state.lastUpdatedItem?.lineId]);

  useEffect(() => {
    if (!isShopping) return;
    const lineId = state.lastUpdatedItem?.lineId;
    if (!lineId) return;
    const timer = window.setTimeout(() => {
      document
        .getElementById(cartItemDomId(lineId))
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [isShopping, state.lastUpdatedItem?.updatedAt, state.lastUpdatedItem?.lineId]);

  // PAYMENT: products unmounted from DOM — focus only on numbers, centered.
  if (isPayment && state.payment) {
    const wechatPay = isWeChatDisplayMethod(
      state.payment.method,
      state.payment.methodLabel,
    );
    const instapayPay = isInstaPayDisplayMethod(
      state.payment.method,
      state.payment.methodLabel,
    );
    const qrPay = isQrPaymentDisplayMethod(
      state.payment.method,
      state.payment.methodLabel,
    );

    if (qrPay) {
      return (
        <div className="flex h-full min-h-0 w-full flex-1 items-center justify-center overflow-hidden px-4 py-6">
          <div className="mx-auto flex w-full max-w-6xl flex-row items-center justify-center gap-8 px-4">
            <div className="min-w-0 flex-1 rounded-3xl bg-slate-900 p-5 text-white shadow-2xl sm:p-8">
              <div className="mb-5 flex items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div className="min-w-0">
                  <h2 className="break-words text-xl font-black sm:text-2xl md:text-3xl">
                    {wechatPay
                      ? "إتمام الدفع · وي شات"
                      : "إتمام الدفع · إنستا باي"}
                  </h2>
                  {wechatPay ? (
                    <p
                      className="mt-1 break-words text-sm text-slate-400 sm:text-base"
                      lang="zh-CN"
                      dir="ltr"
                    >
                      微信支付
                    </p>
                  ) : (
                    <p
                      className="mt-1 break-words text-sm sm:text-base"
                      style={{ color: "#c4a3e8" }}
                      dir="ltr"
                    >
                      InstaPay
                    </p>
                  )}
                </div>
                <img
                  src="/logos/logo-ar.svg"
                  alt=""
                  className="h-10 w-auto shrink-0 rounded-xl bg-white object-contain px-2 py-1 sm:h-12"
                />
              </div>
              <PaymentSummaryRows
                total={state.total}
                paidAmount={state.payment.paidAmount}
                changeAmount={state.payment.changeAmount}
                methodLabel={state.payment.methodLabel}
                paymentMethod={state.payment.method}
                exchangeRate={state.payment.exchangeRate}
                tone="dark"
                size="hero"
              />
            </div>
            <PaymentQrPanel
              variant={instapayPay && !wechatPay ? "instapay" : "wechat"}
            />
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center p-8">
        <div className="w-full max-w-4xl rounded-3xl bg-slate-900 p-6 text-white shadow-2xl sm:p-10 lg:p-12">
          <div className="mb-6 flex items-center justify-between gap-4 border-b border-white/10 pb-5">
            <div className="min-w-0">
              <h2 className="break-words text-2xl font-black md:text-4xl">
                إتمام الدفع
              </h2>
              <p
                className="mt-1 break-words text-base text-slate-400 md:text-xl"
                lang="zh-CN"
                dir="ltr"
              >
                结账付款
              </p>
            </div>
            <img
              src="/logos/logo-ar.svg"
              alt=""
              className="h-12 w-auto shrink-0 rounded-xl bg-white object-contain px-2 py-1 sm:h-16"
            />
          </div>
          {state.customer ? (
            <div className="mb-6 rounded-2xl bg-white/10 px-4 py-3">
              <p className="text-sm text-emerald-200 md:text-base">العميل</p>
              <p className="whitespace-normal break-words text-xl font-bold md:text-2xl">
                {state.customer.name}
              </p>
            </div>
          ) : null}
          <PaymentSummaryRows
            total={state.total}
            paidAmount={state.payment.paidAmount}
            changeAmount={state.payment.changeAmount}
            methodLabel={state.payment.methodLabel}
            paymentMethod={state.payment.method}
            exchangeRate={state.payment.exchangeRate}
            tone="dark"
            size="hero"
          />
        </div>
      </div>
    );
  }

  // SHOPPING: product list + total card at the bottom/side as before.
  return (
    <div className="relative grid h-full min-h-0 grid-cols-1 gap-3 p-2 sm:p-3 lg:grid-cols-12 lg:gap-4 lg:p-4">
      {isShopping ? (
        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-3xl bg-white shadow-xl lg:col-span-8">
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-3 py-2.5 sm:px-4 sm:py-3">
            <div className="min-w-0">
              <h2 className="whitespace-normal break-words text-lg font-black text-slate-900 md:text-xl lg:text-2xl">
                فاتورتك الحالية
              </h2>
              <p
                className="mt-0.5 text-xs font-semibold text-gray-500 md:text-sm"
                lang="zh-CN"
                dir="ltr"
              >
                当前订单
              </p>
            </div>
            <img
              src="/logos/logo-ar.svg"
              alt=""
              className="h-9 w-auto shrink-0 object-contain sm:h-11 md:h-12"
            />
          </header>
          <div className={HIDDEN_SCROLLBAR}>
            {state.items.length === 0 ? (
              <p className="px-3 py-10 text-center text-lg text-slate-400 md:text-xl">
                لا توجد أصناف بعد
              </p>
            ) : (
              state.items.map((item) => {
                const active = item.id === highlightLineId;
                const nameZh = item.nameZh?.trim();
                return (
                  <div
                    key={item.id}
                    id={cartItemDomId(item.id)}
                    className={
                      active
                        ? "mb-1.5 rounded-xl border border-emerald-400 bg-green-100/50 px-2.5 py-2 sm:px-3"
                        : "mb-1.5 rounded-xl border border-slate-100 bg-slate-50 px-2.5 py-2 sm:px-3"
                    }
                  >
                    <div className="flex items-center gap-3 sm:gap-4">
                      <ProductThumb src={item.imageUrl} alt={item.name} />
                      <div className="flex min-w-0 flex-1 flex-col whitespace-normal break-words">
                        <p className="whitespace-normal break-words text-sm font-bold leading-snug text-slate-900 md:text-base lg:text-lg">
                          {item.name}
                        </p>
                        {nameZh ? (
                          <p
                            className="mt-0.5 whitespace-normal break-words text-xs leading-snug text-gray-500 md:text-sm"
                            lang="zh-CN"
                            dir="ltr"
                          >
                            {nameZh}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1 text-end">
                        <p className="text-sm font-black tabular-nums text-emerald-700 md:text-base lg:text-lg">
                          {formatEGP(item.lineTotal)}
                        </p>
                        <p
                          className={
                            active
                              ? "animate-pulse text-xs font-bold tabular-nums text-emerald-700 md:text-sm"
                              : "text-xs font-semibold tabular-nums text-slate-500 md:text-sm"
                          }
                          dir="ltr"
                        >
                          {formatQty(item.qty)} × {formatEGP(item.unitPrice)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      ) : null}

      <aside
        className={`flex min-h-0 min-w-0 flex-col gap-3 ${isShopping ? "lg:col-span-4" : "lg:col-span-12"}`}
      >
        <div className="flex min-h-0 flex-1 flex-col rounded-3xl bg-slate-900 p-3 text-white shadow-xl sm:p-4">
          <BilingualLabel
            ar="عدد الأصناف"
            zh="商品数量"
            arClassName="text-sm font-semibold text-slate-300 md:text-base"
            zhClassName="text-xs font-semibold text-slate-400 md:text-sm"
          />
          <p className="mt-1 text-2xl font-black tabular-nums md:text-3xl lg:text-4xl">
            {state.itemCount}
          </p>
          {state.customer ? (
            <div className="mt-3 rounded-2xl bg-white/10 px-3 py-2.5">
              <p className="text-xs text-emerald-200">العميل</p>
              <p className="whitespace-normal break-words text-base font-bold md:text-lg">
                {state.customer.name}
              </p>
              <p className="mt-0.5 text-sm text-emerald-100">
                النقاط: {state.customer.pointsBalance.toLocaleString("ar-EG")}
              </p>
            </div>
          ) : null}
          {state.discount > 0 ? (
            <div className="mt-3 flex items-center justify-between gap-2 text-sm md:text-base">
              <span className="text-slate-300">الخصم</span>
              <span className="font-bold tabular-nums text-amber-300">
                −{formatEGP(state.discount)}
              </span>
            </div>
          ) : null}

          <div className="mt-auto rounded-2xl bg-emerald-500 px-3 py-3 text-emerald-950 sm:px-4 sm:py-4">
            <BilingualLabel
              ar="المبلغ المطلوب"
              zh="总金额"
              arClassName="text-sm font-bold md:text-base lg:text-lg"
              zhClassName="text-xs font-semibold text-emerald-900/70 md:text-sm"
            />
            <p className="mt-1 whitespace-normal break-words text-2xl font-black tabular-nums leading-none md:text-4xl lg:text-5xl">
              {formatEGP(state.total)}
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}

export default function CustomerDisplayPage() {
  const [state, setState] = useState<CustomerDisplayState>(() =>
    emptyCustomerDisplayState(),
  );

  useEffect(() => {
    document.title = "شاشة العميل · إيجي شاينا";
    return subscribeCustomerDisplayState(setState);
  }, []);

  useEffect(() => {
    // New invoice activity from the cashier interrupts thank-you immediately.
    // clearTimeout in cleanup runs when mode becomes SHOPPING or items arrive.
    if (state.mode === "SHOPPING" || state.items.length > 0) {
      return;
    }

    // Auto-return to welcome/IDLE after a completed sale (change shown).
    if (state.mode !== "COMPLETED" || !state.lastCompletedSale) return;

    const completedAt = state.lastCompletedSale.completedAt;
    const elapsed = Date.now() - completedAt;
    const remaining = Math.max(0, CFD_COMPLETED_MS - elapsed);

    const timer = window.setTimeout(() => {
      const idle = emptyCustomerDisplayState({
        mode: "IDLE",
        items: [],
        payment: null,
        lastUpdatedItem: null,
        lastCompletedSale: null,
        highlightItemId: null,
      });
      publishCustomerDisplayState(idle);
      setState(idle);
    }, remaining);

    return () => window.clearTimeout(timer);
  }, [
    state.mode,
    state.items.length,
    state.lastCompletedSale?.completedAt,
  ]);

  return (
    <div
      dir="rtl"
      className="select-none h-screen min-h-dvh overflow-hidden bg-slate-950 text-slate-900"
    >
      {state.mode === "IDLE" ? (
        <IdleScreen />
      ) : state.mode === "COMPLETED" ? (
        <CompletedScreen state={state} />
      ) : (
        <ShoppingScreen state={state} />
      )}
    </div>
  );
}
