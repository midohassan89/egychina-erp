"use client";

import { useEffect, useMemo, useRef } from "react";
import Keyboard from "react-simple-keyboard";
import "react-simple-keyboard/build/css/index.css";
import { clsx } from "clsx";
import {
  usePosKeyboard,
  type PosKeyboardLayout,
} from "@/components/pos/PosKeyboardContext";

const EN_LAYOUT = [
  "1 2 3 4 5 6 7 8 9 0 {bksp}",
  "q w e r t y u i o p",
  "a s d f g h j k l {clear}",
  "z x c v b n m {enter}",
  "{space} {close}",
];

const AR_LAYOUT = [
  "1 2 3 4 5 6 7 8 9 0 {bksp}",
  "ض ص ث ق ف غ ع ه خ ح ج د",
  "ش س ي ب ل ا ت ن م ك ط {clear}",
  "ئ ء ؤ ر لا ى ة و ز ظ {enter}",
  "{space} {close}",
];

/** Numbers + backspace / clear / enter / close only. */
const NUMPAD_LAYOUT = [
  "7 8 9 {bksp}",
  "4 5 6 {clear}",
  "1 2 3 {enter}",
  "00 0 . {close}",
];

function layoutRows(layout: PosKeyboardLayout): string[] {
  if (layout === "numpad") return NUMPAD_LAYOUT;
  if (layout === "arabic") return AR_LAYOUT;
  return EN_LAYOUT;
}

function isInputElement(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA";
}

/**
 * POS virtual keyboard — fixed to the products column (right),
 * so the cart on the left stays fully visible and interactive.
 */
export function PosTouchKeyboardHost() {
  const {
    keyboardOpen,
    keyboardLayout,
    activeInputName,
    activeValue,
    setFieldValue,
    pressEnter,
    setTextLanguage,
    close,
  } = usePosKeyboard();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const keyboardApiRef = useRef<{ setInput: (input: string) => void } | null>(
    null,
  );

  const isNumpad = keyboardLayout === "numpad";
  const isArabic = keyboardLayout === "arabic";

  // Keep react-simple-keyboard internal buffer aligned without remounting.
  useEffect(() => {
    if (!keyboardOpen) return;
    keyboardApiRef.current?.setInput(activeValue);
  }, [activeValue, keyboardOpen, activeInputName, keyboardLayout]);

  // Click / touch outside → hide keyboard (keeps padding in sync via close()).
  useEffect(() => {
    if (!keyboardOpen) return;

    function handlePointerOutside(event: MouseEvent | TouchEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;

      // Stay open when interacting with the keyboard chrome / keys.
      if (containerRef.current?.contains(target)) return;

      // Stay open when focusing another input (search, qty, cash, etc.).
      if (isInputElement(target)) return;

      close();
    }

    document.addEventListener("mousedown", handlePointerOutside);
    document.addEventListener("touchstart", handlePointerOutside, {
      passive: true,
    });

    return () => {
      document.removeEventListener("mousedown", handlePointerOutside);
      document.removeEventListener("touchstart", handlePointerOutside);
    };
  }, [keyboardOpen, close]);

  const display = useMemo(
    () => ({
      "{bksp}": "⌫",
      "{enter}": isNumpad ? "OK" : isArabic ? "بحث" : "Enter",
      "{space}": isArabic ? "مسافة" : "Space",
      "{close}": "أخفاء",
      "{clear}": isArabic ? "مسح" : "C",
    }),
    [isNumpad, isArabic],
  );

  if (!keyboardOpen || !activeInputName) return null;

  return (
    <div
      ref={containerRef}
      className="pos-no-print fixed bottom-0 left-0 right-0 z-[9999] border-t border-slate-300 bg-slate-200 shadow-[0_-8px_30px_rgba(0,0,0,0.18)] md:left-[26rem] lg:left-[30rem]"
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
          {isNumpad ? "Numpad" : isArabic ? "لوحة عربية" : "English keyboard"}
        </p>

        <div className="flex items-center gap-2">
          {!isNumpad && (
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-400 bg-white text-sm font-extrabold">
              <button
                type="button"
                onClick={() => setTextLanguage("en")}
                className={clsx(
                  "px-3 py-1.5",
                  keyboardLayout === "default"
                    ? "bg-slate-800 text-white"
                    : "text-slate-600 hover:bg-slate-100",
                )}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setTextLanguage("ar")}
                className={clsx(
                  "px-3 py-1.5",
                  keyboardLayout === "arabic"
                    ? "bg-slate-800 text-white"
                    : "text-slate-600 hover:bg-slate-100",
                )}
              >
                العربية
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={close}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-bold text-white hover:bg-slate-900"
          >
            أخفاء
          </button>
        </div>
      </div>

      {/* Always LTR so Arabic rows match a physical keyboard (ض on the left). */}
      <div
        className={clsx("px-2 pb-3", isNumpad && "mx-auto max-w-md")}
        dir="ltr"
      >
        <Keyboard
          key={`kb-${keyboardLayout}-${activeInputName}`}
          keyboardRef={(r) => {
            keyboardApiRef.current = r;
          }}
          layoutName="default"
          theme={clsx(
            "hg-theme-default hg-layout-default pos-touch-kb",
            isNumpad && "pos-numpad-kb",
          )}
          input={activeValue}
          preventMouseDownDefault
          disableCaretPositioning
          onChange={(input: string) => setFieldValue(input)}
          onKeyPress={(button: string) => {
            if (button === "{enter}") pressEnter();
            if (button === "{close}") close();
            if (button === "{clear}") setFieldValue("");
          }}
          display={display}
          layout={{ default: layoutRows(keyboardLayout) }}
          buttonTheme={[
            { class: "hg-enter-key", buttons: "{enter}" },
            { class: "hg-numpad-wide", buttons: "00" },
          ]}
        />
      </div>
    </div>
  );
}
