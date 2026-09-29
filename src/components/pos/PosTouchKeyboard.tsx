"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

function isModalInput(activeInputName: string): boolean {
  const input = resolveActiveInput(activeInputName);
  if (!input) return false;
  return Boolean(
    input.closest('[role="dialog"]') ||
      input.closest("[data-pos-modal]") ||
      input.closest(".fixed.inset-0"),
  );
}

type SelectionSnapshot = {
  start: number;
  end: number;
  value: string;
};

function keyFlex(button: string): string {
  if (button === "{space}") return "flex-[3.5]";
  if (
    button === "{enter}" ||
    button === "{bksp}" ||
    button === "{clear}" ||
    button === "{close}"
  ) {
    return "flex-[1.4]";
  }
  if (button === "00") return "flex-[1.2]";
  return "flex-1";
}

function KeyButton({
  button,
  label,
  activeKey,
  setActiveKey,
  onPress,
  isEnter,
  tall,
}: {
  button: string;
  label: string;
  activeKey: string | null;
  setActiveKey: (key: string | null) => void;
  onPress: (button: string) => void;
  isEnter?: boolean;
  tall?: boolean;
}) {
  const previewLabel = label.length > 4 ? label.slice(0, 3) : label;

  return (
    <button
      type="button"
      className={clsx(
        "relative select-none rounded-lg border border-gray-300/80 font-extrabold text-gray-900 shadow-sm",
        "transition-all duration-75 ease-out",
        "active:scale-95 active:bg-gray-300",
        tall ? "h-[68px] text-2xl" : "h-[52px] text-xl",
        keyFlex(button),
        isEnter
          ? "bg-green-600 text-white border-green-700 active:bg-green-700"
          : "bg-white",
      )}
      onPointerDown={(e) => {
        e.preventDefault();
        setActiveKey(button);
      }}
      onPointerUp={() => {
        setActiveKey(null);
        onPress(button);
      }}
      onPointerLeave={() => setActiveKey(null)}
      onPointerCancel={() => setActiveKey(null)}
    >
      {activeKey === button ? (
        <div className="pointer-events-none absolute -top-14 left-1/2 z-[60] flex h-16 w-14 -translate-x-1/2 items-center justify-center rounded-lg border border-gray-300 bg-white text-3xl font-bold text-gray-900 shadow-2xl">
          {previewLabel}
        </div>
      ) : null}
      <span className="pointer-events-none">{label}</span>
    </button>
  );
}

/**
 * POS virtual keyboard — floating overlay inside the product-grid column.
 * Does not reserve layout space; sits above the grid with a mobile key preview.
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

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectionSnapshotRef = useRef<SelectionSnapshot>({
    start: 0,
    end: 0,
    value: "",
  });
  const activeValueRef = useRef(activeValue);
  activeValueRef.current = activeValue;

  const isNumpad = keyboardLayout === "numpad";
  const isArabic = keyboardLayout === "arabic";

  const display = useMemo(
    () =>
      ({
        "{bksp}": "⌫",
        "{enter}": isNumpad ? "OK" : isArabic ? "بحث" : "Enter",
        "{space}": isArabic ? "مسافة" : "Space",
        "{close}": "أخفاء",
        "{clear}": isArabic ? "مسح" : "C",
      }) as Record<string, string>,
    [isNumpad, isArabic],
  );

  const rows = useMemo(
    () =>
      layoutRows(keyboardLayout).map((row) =>
        row.split(" ").filter(Boolean),
      ),
    [keyboardLayout],
  );

  const captureSelectionIfFocused = useCallback(() => {
    if (!activeInputName) return;
    const input = resolveActiveInput(activeInputName);
    if (!input) return;
    if (document.activeElement !== input) return;
    selectionSnapshotRef.current = {
      start: input.selectionStart ?? 0,
      end: input.selectionEnd ?? 0,
      value: activeValueRef.current,
    };
  }, [activeInputName]);

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

  useEffect(() => {
    if (!keyboardOpen) setActiveKey(null);
  }, [keyboardOpen]);

  const applyBackspace = useCallback(() => {
    if (!activeInputName) return;

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

  const insertText = useCallback(
    (text: string) => {
      const snap = selectionSnapshotRef.current;
      const current = snap.value || activeValueRef.current;
      const start = snap.start;
      const end = snap.end;
      const next =
        start !== end
          ? current.slice(0, start) + text + current.slice(end)
          : current + text;
      const caret = (start !== end ? start : current.length) + text.length;
      setFieldValue(next);
      selectionSnapshotRef.current = {
        start: caret,
        end: caret,
        value: next,
      };
      if (!activeInputName) return;
      window.setTimeout(() => {
        const el = resolveActiveInput(activeInputName);
        if (!el) return;
        el.focus();
        try {
          el.setSelectionRange(caret, caret);
        } catch {
          // ignore
        }
      }, 0);
    },
    [activeInputName, setFieldValue],
  );

  const handleKeyPress = useCallback(
    (button: string) => {
      captureSelectionIfFocused();

      if (button === "{bksp}") {
        applyBackspace();
        return;
      }
      if (button === "{enter}") {
        pressEnter();
        return;
      }
      if (button === "{close}") {
        close();
        return;
      }
      if (button === "{clear}") {
        setFieldValue("");
        selectionSnapshotRef.current = { start: 0, end: 0, value: "" };
        return;
      }
      if (button === "{space}") {
        insertText(" ");
        return;
      }

      insertText(button);
    },
    [
      applyBackspace,
      captureSelectionIfFocused,
      close,
      insertText,
      pressEnter,
      setFieldValue,
    ],
  );

  if (!keyboardOpen || !activeInputName) return null;

  const modalMode = isModalInput(activeInputName);

  return (
    <div
      ref={containerRef}
      className={clsx(
        "pos-no-print p-2 sm:p-4",
        modalMode
          ? "fixed bottom-0 left-0 right-0 z-[100]"
          : "absolute bottom-0 left-0 z-50 w-full",
      )}
      onMouseDown={(e) => {
        captureSelectionIfFocused();
        e.preventDefault();
      }}
      onTouchStart={() => {
        captureSelectionIfFocused();
      }}
    >
      <div
        className={clsx(
          "overflow-visible rounded-2xl border border-gray-300/80",
          "bg-gray-200/90 shadow-[0_-10px_40px_rgba(0,0,0,0.15)] backdrop-blur-md",
          isNumpad && "mx-auto max-w-md",
        )}
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
                    "select-none px-3 py-1.5 transition-all duration-75 ease-out active:scale-95 active:bg-gray-300",
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
                    "select-none px-3 py-1.5 transition-all duration-75 ease-out active:scale-95 active:bg-gray-300",
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
              className="select-none rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-bold text-white transition-all duration-75 ease-out hover:bg-slate-900 active:scale-95 active:bg-gray-300"
            >
              أخفاء
            </button>
          </div>
        </div>

        <div
          className={clsx("space-y-1.5 px-2 pb-3", isNumpad && "px-3")}
          dir="ltr"
        >
          {rows.map((row, rowIndex) => (
            <div key={`row-${rowIndex}`} className="flex gap-1.5">
              {row.map((button) => (
                <KeyButton
                  key={`${rowIndex}-${button}`}
                  button={button}
                  label={display[button] ?? button}
                  activeKey={activeKey}
                  setActiveKey={setActiveKey}
                  onPress={handleKeyPress}
                  isEnter={button === "{enter}"}
                  tall={isNumpad}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
