"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";

interface BarcodeScannerModalProps {
  open: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
}

const REGION_ID = "erp-barcode-scanner";

export function BarcodeScannerModal({
  open,
  onClose,
  onScan,
}: BarcodeScannerModalProps) {
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef = useRef<any>(null);
  const handledRef = useRef(false);

  useEffect(() => {
    if (!open) return;

    handledRef.current = false;
    setError(null);
    let cancelled = false;

    async function start() {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const scanner = new Html5Qrcode(REGION_ID);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 260, height: 140 } },
          (decoded: string) => {
            if (handledRef.current || cancelled) return;
            handledRef.current = true;
            const value = decoded.trim();
            if (!value) return;
            onScan(value);
            void stopScanner();
            onClose();
          },
          () => {
            // ignore frame-level no-match noise
          },
        );
      } catch (err) {
        if (cancelled) return;
        setError("تعذر تشغيل الكاميرا. اسمح باستخدام الكاميرا ثم أعد المحاولة.");
      }
    }

    void start();

    return () => {
      cancelled = true;
      void stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start once per open
  }, [open]);

  async function stopScanner() {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    try {
      if (scanner.isScanning) {
        await scanner.stop();
      }
      scanner.clear();
    } catch {
      // ignore stop errors
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/60"
        aria-label="إغلاق الماسح"
        onClick={() => {
          void stopScanner();
          onClose();
        }}
      />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-brand-600" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-gray-100">
              مسح الباركود
            </h2>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            onClick={() => {
              void stopScanner();
              onClose();
            }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3 p-4">
          <div
            id={REGION_ID}
            className="overflow-hidden rounded-lg bg-slate-900 [&_video]:max-h-72 [&_video]:w-full [&_video]:object-cover"
          />
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : (
            <p className="text-xs text-slate-500 dark:text-gray-400">
              وجّه الكاميرا الخلفية نحو الباركود. يتوقف المسح تلقائياً عند القراءة.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
