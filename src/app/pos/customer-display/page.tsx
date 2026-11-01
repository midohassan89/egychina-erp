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

function cartItemDomId(lineId: string): string {
  return `cart-item-${lineId}`;
}

type ClockAngles = {
  hours: number;
  minutes: number;
  seconds: number;
};

/** Numerals ordered for clock positions starting at 12, then 1…11. */
const CLOCK_NUMERALS = [
  ["١٢", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩", "١٠", "١١"],
  ["12", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"],
  ["十二", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一"],
] as const;

function AnalogClock({
  className = "",
  langIndex = 0,
  numerals,
}: {
  className?: string;
  langIndex?: number;
  numerals?: readonly string[];
}) {
  const [angles, setAngles] = useState<ClockAngles>(() => {
    const time = new Date();
    return {
      seconds: (time.getSeconds() + time.getMilliseconds() / 1000) * 6,
      minutes: (time.getMinutes() + time.getSeconds() / 60) * 6,
      hours: ((time.getHours() % 12) + time.getMinutes() / 60) * 30,
    };
  });

  useEffect(() => {
    let frame = 0;

    const tick = () => {
      const time = new Date();
      const secondsAngle =
        (time.getSeconds() + time.getMilliseconds() / 1000) * 6;
      const minutesAngle = (time.getMinutes() + time.getSeconds() / 60) * 6;
      const hoursAngle =
        ((time.getHours() % 12) + time.getMinutes() / 60) * 30;

      setAngles({
        hours: hoursAngle,
        minutes: minutesAngle,
        seconds: secondsAngle,
      });

      frame = window.requestAnimationFrame(tick);
    };

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
              const x = 100 + radius * Math.cos(angleRad);
              const y = 100 + radius * Math.sin(angleRad);
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
          {/* Hour hand */}
          <line
            x1="100"
            y1="100"
            x2="100"
            y2="55"
            stroke="#f8fafc"
            strokeWidth="5.5"
            strokeLinecap="round"
            transform={`rotate(${angles.hours} 100 100)`}
          />
          {/* Minute hand */}
          <line
            x1="100"
            y1="100"
            x2="100"
            y2="38"
            stroke="#ffffff"
            strokeWidth="3.5"
            strokeLinecap="round"
            transform={`rotate(${angles.minutes} 100 100)`}
          />
          {/* Second hand with tail */}
          <g transform={`rotate(${angles.seconds} 100 100)`}>
            <line
              x1="100"
              y1="118"
              x2="100"
              y2="28"
              stroke="#f59e0b"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle cx="100" cy="100" r="5" fill="#f59e0b" />
            <circle cx="100" cy="100" r="2.2" fill="#fff7ed" />
          </g>
        </svg>
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
            <p className="whitespace-normal break-words text-sm font-semibold text-emerald-100 sm:text-base md:text-lg lg:text-xl">
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
  tone = "dark",
}: {
  total: number;
  paidAmount: number;
  changeAmount: number;
  methodLabel?: string | null;
  tone?: "dark" | "light";
}) {
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

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-base font-bold md:text-2xl ${labelMain}`}>
            المبلغ المطلوب
          </p>
          <p className={`text-sm opacity-80 ${zhMuted}`} lang="zh-CN" dir="ltr">
            总金额
          </p>
        </div>
        <p
          className={`shrink-0 text-2xl font-bold tabular-nums md:text-3xl ${valueMain}`}
        >
          {formatEGP(total)}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-sm font-semibold md:text-lg ${labelMuted}`}>
            النقدية المستلمة
            {methodLabel ? ` · ${methodLabel}` : ""}
          </p>
          <p className={`text-sm opacity-80 ${zhMuted}`} lang="zh-CN" dir="ltr">
            收款金额
          </p>
        </div>
        <p
          className={`shrink-0 text-xl font-bold tabular-nums md:text-2xl ${valuePaid}`}
        >
          {formatEGP(paidAmount)}
        </p>
      </div>

      <div className="rounded-2xl bg-green-600 px-3 py-3 text-white sm:px-4 sm:py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold md:text-lg">الباقي للعميل</p>
            <p className="text-sm text-emerald-100/90" lang="zh-CN" dir="ltr">
              找零
            </p>
          </div>
          <p className="shrink-0 text-2xl font-black tabular-nums md:text-4xl lg:text-5xl">
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
    <div className="relative flex h-full min-h-0 flex-col items-center justify-center overflow-hidden px-4 text-center sm:px-8">
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
        <div className="relative z-10 mt-6 w-full max-w-xl rounded-3xl bg-white/10 p-4 text-start text-white backdrop-blur sm:mt-10 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3 text-base md:text-xl">
            <span className="text-emerald-100">رقم الفاتورة</span>
            <span className="font-black tabular-nums" dir="ltr">
              {sale.orderNumber}
            </span>
          </div>
          <PaymentSummaryRows
            total={sale.total}
            paidAmount={sale.paidAmount}
            changeAmount={sale.changeAmount}
            tone="dark"
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

  useEffect(() => {
    const lineId = state.lastUpdatedItem?.lineId;
    if (!lineId) {
      setHighlightLineId(null);
      return;
    }
    setHighlightLineId(lineId);
    const timer = window.setTimeout(() => setHighlightLineId(null), CFD_HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [state.lastUpdatedItem?.updatedAt, state.lastUpdatedItem?.lineId]);

  useEffect(() => {
    const lineId = state.lastUpdatedItem?.lineId;
    if (!lineId) return;
    const timer = window.setTimeout(() => {
      document
        .getElementById(cartItemDomId(lineId))
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [state.lastUpdatedItem?.updatedAt, state.lastUpdatedItem?.lineId]);

  return (
    <div className="relative grid h-full min-h-0 grid-cols-1 gap-3 p-2 sm:p-3 lg:grid-cols-12 lg:gap-4 lg:p-4">
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

      <aside className="flex min-h-0 min-w-0 flex-col gap-3 lg:col-span-4">
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

          {state.mode === "PAYMENT" && state.payment ? (
            <div className="mt-auto rounded-2xl border border-emerald-400/40 bg-white/5 px-3 py-3 sm:px-4 sm:py-4">
              <PaymentSummaryRows
                total={state.total}
                paidAmount={state.payment.paidAmount}
                changeAmount={state.payment.changeAmount}
                methodLabel={state.payment.methodLabel}
                tone="dark"
              />
            </div>
          ) : (
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
          )}
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
