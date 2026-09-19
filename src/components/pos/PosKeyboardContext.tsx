"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { clsx } from "clsx";

/** Space reserved above the fixed virtual keyboard so inputs stay visible. */
export const POS_KEYBOARD_CLEARANCE_PX = 350;

export type PosKeyboardMode = "text" | "numpad";
export type PosKeyboardLayout = "default" | "arabic" | "numpad";

export interface PosKeyboardFieldBind {
  name: string;
  mode: PosKeyboardMode;
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
}

interface BindingHandlers {
  mode: PosKeyboardMode;
  onChange: (value: string) => void;
  onEnter?: () => void;
}

interface PosKeyboardContextValue {
  /** @deprecated prefer keyboardOpen */
  open: boolean;
  keyboardOpen: boolean;
  keyboardLayout: PosKeyboardLayout;
  activeInputName: string | null;
  /** Current bound input value shown on the keyboard. */
  activeValue: string;
  focusField: (field: PosKeyboardFieldBind) => void;
  /** Sync React-controlled value → keyboard display without rebinding handlers. */
  syncFieldValue: (name: string, value: string) => void;
  setFieldValue: (value: string) => void;
  pressEnter: () => void;
  setTextLanguage: (lang: "en" | "ar") => void;
  close: () => void;
  insetStyle: CSSProperties;
}

const PosKeyboardContext = createContext<PosKeyboardContextValue | null>(null);

function layoutForMode(
  mode: PosKeyboardMode,
  textLang: "en" | "ar",
): PosKeyboardLayout {
  if (mode === "numpad") return "numpad";
  return textLang === "ar" ? "arabic" : "default";
}

export function PosKeyboardProvider({ children }: { children: ReactNode }) {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [keyboardLayout, setKeyboardLayout] =
    useState<PosKeyboardLayout>("default");
  const [activeInputName, setActiveInputName] = useState<string | null>(null);
  const [activeValue, setActiveValue] = useState("");
  const [textLang, setTextLang] = useState<"en" | "ar">("en");

  const handlersRef = useRef<Map<string, BindingHandlers>>(new Map());
  const activeNameRef = useRef<string | null>(null);

  const focusField = useCallback(
    (field: PosKeyboardFieldBind) => {
      handlersRef.current.set(field.name, {
        mode: field.mode,
        onChange: field.onChange,
        onEnter: field.onEnter,
      });
      activeNameRef.current = field.name;
      setActiveInputName(field.name);
      setActiveValue(field.value);
      setKeyboardLayout(layoutForMode(field.mode, textLang));
      setKeyboardOpen(true);
    },
    [textLang],
  );

  const syncFieldValue = useCallback((name: string, value: string) => {
    if (activeNameRef.current !== name) return;
    setActiveValue((prev) => (prev === value ? prev : value));
  }, []);

  const setFieldValue = useCallback((value: string) => {
    const name = activeNameRef.current;
    if (!name) return;
    const handlers = handlersRef.current.get(name);
    if (!handlers) return;
    setActiveValue(value);
    handlers.onChange(value);
  }, []);

  const pressEnter = useCallback(() => {
    const name = activeNameRef.current;
    if (!name) return;
    handlersRef.current.get(name)?.onEnter?.();
  }, []);

  const setTextLanguage = useCallback((lang: "en" | "ar") => {
    setTextLang(lang);
    setKeyboardLayout((prev) => {
      if (prev === "numpad") return prev;
      return lang === "ar" ? "arabic" : "default";
    });
  }, []);

  const close = useCallback(() => {
    setKeyboardOpen(false);
    setActiveInputName(null);
    activeNameRef.current = null;
    setActiveValue("");
  }, []);

  const insetStyle = useMemo<CSSProperties>(
    () => ({
      paddingBottom: keyboardOpen ? POS_KEYBOARD_CLEARANCE_PX : 0,
    }),
    [keyboardOpen],
  );

  const value = useMemo<PosKeyboardContextValue>(
    () => ({
      open: keyboardOpen,
      keyboardOpen,
      keyboardLayout,
      activeInputName,
      activeValue,
      focusField,
      syncFieldValue,
      setFieldValue,
      pressEnter,
      setTextLanguage,
      close,
      insetStyle,
    }),
    [
      keyboardOpen,
      keyboardLayout,
      activeInputName,
      activeValue,
      focusField,
      syncFieldValue,
      setFieldValue,
      pressEnter,
      setTextLanguage,
      close,
      insetStyle,
    ],
  );

  return (
    <PosKeyboardContext.Provider value={value}>
      {children}
    </PosKeyboardContext.Provider>
  );
}

export function usePosKeyboard() {
  const ctx = useContext(PosKeyboardContext);
  if (!ctx) {
    throw new Error("usePosKeyboard must be used within PosKeyboardProvider");
  }
  return ctx;
}

export function usePosKeyboardOptional() {
  return useContext(PosKeyboardContext);
}

/**
 * Scrollable region that grows bottom padding when the virtual keyboard is open.
 */
export function PosKeyboardScrollArea({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const kb = usePosKeyboardOptional();
  return (
    <div
      className={clsx("min-h-0 overflow-y-auto", className)}
      style={{ ...style, ...(kb?.insetStyle ?? {}) }}
    >
      {children}
    </div>
  );
}
