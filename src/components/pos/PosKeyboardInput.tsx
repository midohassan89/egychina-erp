"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type FocusEvent,
  type InputHTMLAttributes,
} from "react";
import {
  usePosKeyboardOptional,
  type PosKeyboardMode,
} from "@/components/pos/PosKeyboardContext";

type PosKeyboardInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
> & {
  value: string;
  onChange: (value: string) => void;
  mode?: PosKeyboardMode;
  onEnter?: () => void;
  /** Disable virtual keyboard binding (native input only). */
  disableVirtualKeyboard?: boolean;
  /** Stable name for the keyboard binding (optional; auto-generated). */
  inputName?: string;
};

function scrollFocusedInputIntoView(fallback: HTMLElement) {
  window.setTimeout(() => {
    const target =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : fallback;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 150);
}

/**
 * Controlled input that binds to the global POS virtual keyboard on focus.
 * Handlers are kept in refs so value updates do not re-bind / fight the keyboard.
 */
export const PosKeyboardInput = forwardRef<
  HTMLInputElement,
  PosKeyboardInputProps
>(function PosKeyboardInput(
  {
    value,
    onChange,
    mode = "text",
    onEnter,
    disableVirtualKeyboard,
    inputName,
    onFocus,
    ...rest
  },
  ref,
) {
  const kb = usePosKeyboardOptional();
  const reactId = useId();
  const name = inputName ?? `pos-kb-${reactId}`;
  const localRef = useRef<HTMLInputElement | null>(null);

  const onChangeRef = useRef(onChange);
  const onEnterRef = useRef(onEnter);
  const modeRef = useRef(mode);
  onChangeRef.current = onChange;
  onEnterRef.current = onEnter;
  modeRef.current = mode;

  const syncFieldValue = kb?.syncFieldValue;
  const keyboardOpen = kb?.keyboardOpen;
  const activeInputName = kb?.activeInputName;

  // Sync display value only — never re-focus / rebind (that caused update loops).
  useEffect(() => {
    if (!keyboardOpen || activeInputName !== name || !syncFieldValue) return;
    syncFieldValue(name, value);
  }, [value, name, keyboardOpen, activeInputName, syncFieldValue]);

  function assignRef(node: HTMLInputElement | null) {
    localRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  }

  function handleFocus(e: FocusEvent<HTMLInputElement>) {
    onFocus?.(e);
    if (disableVirtualKeyboard || !kb) return;

    kb.focusField({
      name,
      mode: modeRef.current,
      value,
      onChange: (next) => onChangeRef.current(next),
      onEnter: () => onEnterRef.current?.(),
    });
    scrollFocusedInputIntoView(e.currentTarget);
  }

  return (
    <input
      {...rest}
      ref={assignRef}
      data-pos-kb-name={name}
      value={value}
      inputMode={rest.inputMode ?? "none"}
      onChange={(e) => onChange(e.target.value)}
      onFocus={handleFocus}
      onKeyDown={(e) => {
        rest.onKeyDown?.(e);
        if (e.key === "Enter") {
          e.preventDefault();
          onEnter?.();
        }
      }}
    />
  );
});
