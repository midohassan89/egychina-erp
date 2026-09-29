"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
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

function resolveActiveInput(
  activeInputName: string,
): HTMLInputElement | HTMLTextAreaElement | null {
  const byName = document.querySelector(
    `[data-pos-kb-name="${activeInputName}"]`,
  );
  if (
    byName instanceof HTMLInputElement ||
    byName instanceof HTMLTextAreaElement
  ) {
    return byName;
  }
  const active = document.activeElement;
  if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement
  ) {
    return active;
  }
  return null;
}

type SelectionSnapshot = {
  start: number;
  end: number;
  value: string;
};

/**
 * POS virtual keyboard — floating on the LEFT so the RTL cart (right)
 * stays fully visible and interactive.
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
  /** Last known selection while the bound input was focused (survives blur on key tap). */
  const selectionSnapshotRef = useRef<SelectionSnapshot>({
    start: 0,
    end: 0,
    value: "",
  });
  const activeValueRef = useRef(activeValue);
  activeValueRef.current = activeValue;

  const isNumpad = keyboardLayout === "numpad";
  const isArabic = keyboardLayout === "arabic";

  const captureSelectionIfFocused = useCallback(() => {
    if (!activeInputName) return;
    const input = resolveActiveInput(activeInputName);
    if (!input) return;
    // Only refresh while still focused — blur collapses selection to a caret.
    if (document.activeElement !== input) return;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    selectionSnapshotRef.current = {
      start,
      end,
      value: activeValueRef.current,
    };
  }, [activeInputName]);

  // Track selection while the bound input is focused (e.g. select-all on search focus).
  useEffect(() => {
    if (!keyboardOpen || !activeInputName) return;
    const input = resolveActiveInput(activeInputName);
    if (!input) return;

    const save = () => {
      if (document.activeElement !== input) return;
      selectionSnapshotRef.current = {
        start: input.selectionStart ?? 0,
        end: input.selectionEnd ?? 0,
        value: activeValueRef.current,
      };
    };

    save();
    input.addEventListener("select", save);
    input.addEventListener("keyup", save);
    input.addEventListener("mouseup", save);
    document.addEventListener("selectionchange", save);

    return () => {
      input.removeEventListener("select", save);
      input.removeEventListener("keyup", save);
      input.removeEventListener("mouseup", save);
      document.removeEventListener("selectionchange", save);
    };
  }, [keyboardOpen, activeInputName, activeValue]);

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

      if (containerRef.current?.contains(target)) return;
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

  const applyBackspace = useCallback(() => {
    if (!activeInputName) return;

    // Snapshot is taken on pointer-down while the input was still focused
    // (including full select-all). Do not re-read a collapsed caret after blur.
    const snap = selectionSnapshotRef.current;
    const inputValue = snap.value || activeValueRef.current;
    const start = snap.start;
    const end = snap.end;

    let next: string;
    let caret: number;

    if (start !== end) {
      next = inputValue.slice(0, start) + inputValue.slice(end);
      caret = start;
    } else {
      next = inputValue.slice(0, -1);
      caret = Math.max(0, start - 1);
    }

    setFieldValue(next);
    keyboardApiRef.current?.setInput(next);

    selectionSnapshotRef.current = {
      start: caret,
      end: caret,
      value: next,
    };

    window.setTimeout(() => {
      const el = resolveActiveInput(activeInputName);
      if (!el) return;
      el.focus();
      try {
        el.setSelectionRange(caret, caret);
      } catch {
        // Some input types reject setSelectionRange.
      }
      selectionSnapshotRef.current = {
        start: caret,
        end: caret,
        value: next,
      };
    }, 0);
  }, [activeInputName, setFieldValue]);

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
      className="pos-no-print fixed z-[9999] left-4 bottom-4 w-[min(100%-2rem,42rem)] max-h-[45vh] overflow-auto rounded-2xl border border-slate-300 bg-slate-200 shadow-[0_8px_30px_rgba(0,0,0,0.18)] md:left-8 md:bottom-8"
      onMouseDown={(e) => {
        // Snapshot selection before preventDefault/blur side-effects.
        captureSelectionIfFocused();
        e.preventDefault();
      }}
      onTouchStart={() => {
        captureSelectionIfFocused();
      }}
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
                  "select-none px-3 py-1.5 transition-all duration-75 ease-out active:scale-[0.92] active:bg-gray-300",
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
                  "select-none px-3 py-1.5 transition-all duration-75 ease-out active:scale-[0.92] active:bg-gray-300",
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
            className="select-none rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-bold text-white transition-all duration-75 ease-out hover:bg-slate-900 active:scale-[0.92] active:bg-gray-300"
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
            // Library fires onChange before onKeyPress — overwrite bksp with
            // selection-aware delete (clears full select-all correctly).
            if (button === "{bksp}") {
              applyBackspace();
              return;
            }
            if (button === "{enter}") pressEnter();
            if (button === "{close}") close();
            if (button === "{clear}") {
              setFieldValue("");
              keyboardApiRef.current?.setInput("");
              selectionSnapshotRef.current = {
                start: 0,
                end: 0,
                value: "",
              };
            }
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
