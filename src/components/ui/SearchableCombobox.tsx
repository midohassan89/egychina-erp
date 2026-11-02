"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { ChevronsUpDown, Search } from "lucide-react";
import { clsx } from "clsx";

export type SearchableComboboxOption = {
  id: string;
  name: string;
};

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase("ar");
}

interface SearchableComboboxProps {
  options: SearchableComboboxOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  loadingLabel?: string;
  loaded?: boolean;
  className?: string;
  disabled?: boolean;
}

/**
 * RTL-friendly searchable dropdown for large option lists (categories/brands).
 * Filters case-insensitively and supports Arabic text.
 * Dropdown is portaled so it stays visible above scrollable modal content.
 */
export function SearchableCombobox({
  options,
  value,
  onChange,
  placeholder = "ابحث واختر...",
  emptyLabel = "لا توجد نتائج",
  loadingLabel = "جاري التحميل…",
  loaded = true,
  className,
  disabled = false,
}: SearchableComboboxProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});

  const selected = useMemo(
    () => options.find((option) => option.id === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(() => {
    const needle = normalizeSearch(query);
    if (!needle) return options;
    return options.filter((option) =>
      normalizeSearch(option.name).includes(needle),
    );
  }, [options, query]);

  function updateMenuPosition() {
    const anchor = rootRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < 240 && rect.top > spaceBelow;
    setMenuStyle({
      position: "fixed",
      left: rect.left,
      width: rect.width,
      zIndex: 100,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + 4, maxHeight: Math.min(240, rect.top - 8) }
        : { top: rect.bottom + 4, maxHeight: Math.min(240, spaceBelow - 8) }),
    });
  }

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const onReposition = () => updateMenuPosition();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, filtered.length, query]);

  useEffect(() => {
    if (!open) return;
    setHighlightIndex(0);
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
      setQuery("");
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function openList() {
    if (disabled) return;
    setOpen(true);
    setQuery("");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function selectOption(option: SearchableComboboxOption) {
    onChange(option.id);
    setOpen(false);
    setQuery("");
  }

  function clearSelection() {
    onChange("");
    setQuery("");
    setOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlightIndex((prev) =>
        filtered.length === 0 ? 0 : Math.min(prev + 1, filtered.length - 1),
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightIndex((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const option = filtered[highlightIndex];
      if (option) selectOption(option);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setQuery("");
    }
  }

  const dropdown =
    open && typeof document !== "undefined"
      ? createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            dir="rtl"
            style={menuStyle}
            className="overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-right shadow-xl dark:border-gray-700 dark:bg-gray-900"
          >
            {value ? (
              <li>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="w-full px-3 py-2 text-start text-sm text-slate-500 hover:bg-slate-50 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  مسح الاختيار
                </button>
              </li>
            ) : null}
            {!loaded ? (
              <li className="px-3 py-2 text-sm text-slate-400">{loadingLabel}</li>
            ) : filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-400">{emptyLabel}</li>
            ) : (
              filtered.map((option, index) => {
                const active = option.id === value;
                const highlighted = index === highlightIndex;
                return (
                  <li key={option.id} role="option" aria-selected={active}>
                    <button
                      type="button"
                      onMouseEnter={() => setHighlightIndex(index)}
                      onClick={() => selectOption(option)}
                      className={clsx(
                        "w-full px-3 py-2 text-start text-sm",
                        highlighted
                          ? "bg-brand-50 text-brand-800 dark:bg-slate-800 dark:text-brand-300"
                          : "text-slate-800 hover:bg-slate-50 dark:text-gray-100 dark:hover:bg-gray-800",
                        active && "font-semibold",
                      )}
                    >
                      {option.name}
                    </button>
                  </li>
                );
              })
            )}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className={clsx("relative min-w-0 flex-1", className)}>
      {!open ? (
        <button
          type="button"
          disabled={disabled}
          onClick={openList}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-start text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900"
        >
          <span
            className={clsx(
              "min-w-0 flex-1 truncate",
              selected ? "text-slate-900 dark:text-gray-100" : "text-slate-400",
            )}
          >
            {!loaded
              ? loadingLabel
              : selected
                ? selected.name
                : placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
        </button>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            dir="rtl"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            role="combobox"
            className="w-full rounded-lg border border-brand-500 bg-white py-2.5 pe-3 ps-9 text-sm outline-none ring-2 ring-brand-500/20 dark:border-brand-500 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>
      )}
      {dropdown}
    </div>
  );
}
