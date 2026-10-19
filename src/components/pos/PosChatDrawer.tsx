"use client";

import { useEffect, useRef, useState } from "react";
import type { PosDeskThread } from "@/hooks/usePosDesk";

const CANNED = [
  "جاري تجهيز طلبك الآن",
  "السائق في الطريق إليك",
  "تم استلام الصورة وجاري المراجعة",
];

interface ChatRow {
  id: string;
  senderRole: string;
  originalText: string;
  originalLang: string;
  textAr: string;
  attachmentUrl: string | null;
  attachmentType: string | null;
}

export function PosChatDrawer({
  open,
  threads,
  onClose,
  onSent,
}: {
  open: boolean;
  threads: PosDeskThread[];
  onClose: () => void;
  onSent: () => void;
}) {
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const active = threads.find((thread) => thread.customerId === customerId) ?? null;

  useEffect(() => {
    if (!open || !customerId) return;
    let cancelled = false;
    void fetch(`/api/dashboard/chat?customerId=${encodeURIComponent(customerId)}`, {
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((body: { messages?: ChatRow[] }) => {
        if (!cancelled) setMessages(body.messages ?? []);
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, customerId]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  if (!open) return null;

  function chooseFile(file: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    setPending(file);
    setPreview(file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
  }

  async function send(reply = text, includeFile = true) {
    if (!customerId || sending) return;
    const message = reply.trim();
    const file = includeFile ? pending : null;
    if (!message && !file) return;
    setSending(true);
    try {
      let attachmentUrl = "";
      let attachmentType: "IMAGE" | "FILE" | null = null;
      if (file) {
        const form = new FormData();
        form.set("file", file);
        const uploaded = await fetch("/api/dashboard/chat/upload", { method: "POST", body: form });
        const saved = (await uploaded.json()) as {
          url?: string;
          attachmentType?: "IMAGE" | "FILE";
          error?: string;
        };
        if (!uploaded.ok || !saved.url) throw new Error(saved.error ?? "تعذر رفع الملف");
        attachmentUrl = saved.url;
        attachmentType = saved.attachmentType ?? "FILE";
      }
      const res = await fetch("/api/dashboard/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          text: message,
          attachmentUrl,
          attachmentType,
        }),
      });
      if (!res.ok) throw new Error("تعذر الإرسال");
      setText("");
      chooseFile(null);
      const thread = await fetch(
        `/api/dashboard/chat?customerId=${encodeURIComponent(customerId)}`,
        { cache: "no-store" },
      );
      const body = (await thread.json()) as { messages?: ChatRow[] };
      setMessages(body.messages ?? []);
      onSent();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "تعذر الإرسال");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex justify-start bg-slate-950/50">
      <button type="button" className="h-full flex-1" aria-label="إغلاق" onClick={onClose} />
      <aside className="flex h-full w-full max-w-lg flex-col bg-white text-slate-900 shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-bold">شات العملاء</h2>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            إغلاق
          </button>
        </header>
        <div className="flex min-h-0 flex-1">
          <div className="w-36 shrink-0 overflow-y-auto border-e border-slate-200">
            {threads.length === 0 ? (
              <p className="p-3 text-xs text-slate-500">لا توجد محادثات</p>
            ) : (
              threads.map((thread) => (
                <button
                  key={thread.customerId}
                  type="button"
                  onClick={() => setCustomerId(thread.customerId)}
                  className={`block w-full border-b border-slate-100 px-2 py-2 text-right text-xs ${
                    customerId === thread.customerId ? "bg-sky-100 font-bold" : "hover:bg-slate-50"
                  }`}
                >
                  <span className="block truncate">{thread.name || thread.phone}</span>
                  {thread.unread > 0 ? (
                    <span className="text-rose-700">{thread.unread} جديد</span>
                  ) : null}
                </button>
              ))
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              {!active ? (
                <p className="py-8 text-center text-sm text-slate-500">اختر محادثة</p>
              ) : (
                messages.map((row) => {
                  const mine = row.senderRole !== "CUSTOMER";
                  const image = row.attachmentType === "IMAGE" ? row.attachmentUrl : null;
                  return (
                    <div
                      key={row.id}
                      className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${
                        mine ? "ms-auto bg-emerald-700 text-white" : "bg-slate-100 text-slate-900"
                      }`}
                    >
                      <p>{row.textAr || row.originalText}</p>
                      {!mine && row.originalLang !== "ar" && row.originalText ? (
                        <p className="mt-1 text-xs opacity-70">{row.originalText}</p>
                      ) : null}
                      {image ? (
                        <button type="button" onClick={() => setLightbox(image)}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={image} alt="" className="mt-2 max-h-40 rounded-lg" />
                        </button>
                      ) : row.attachmentUrl ? (
                        <a href={row.attachmentUrl} className="mt-1 block underline" target="_blank" rel="noreferrer">
                          ملف مرفق
                        </a>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
            {active && (
              <div className="space-y-2 border-t border-slate-200 p-2">
                <div className="flex flex-wrap gap-1">
                  {CANNED.map((reply) => (
                    <button
                      key={reply}
                      type="button"
                      disabled={sending}
                      onClick={() => void send(reply, false)}
                      className="rounded-full bg-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-800"
                    >
                      {reply}
                    </button>
                  ))}
                </div>
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="" className="h-16 rounded-lg border border-slate-300" />
                ) : pending ? (
                  <p className="text-xs text-slate-600">{pending.name}</p>
                ) : null}
                <div className="flex items-end gap-1">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,.pdf,.txt"
                    className="hidden"
                    onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
                  />
                  <input
                    ref={cameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
                  />
                  <button type="button" className="rounded-lg px-2 py-2 text-lg" onClick={() => fileRef.current?.click()} aria-label="إرفاق">
                    📎
                  </button>
                  <button type="button" className="rounded-lg px-2 py-2 text-lg" onClick={() => cameraRef.current?.click()} aria-label="كاميرا">
                    📷
                  </button>
                  <input
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder="اكتب الرد"
                    className="pos-input min-w-0 flex-1 rounded-lg border border-slate-400 bg-white px-2 py-2 text-sm font-semibold text-slate-900"
                  />
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => void send()}
                    className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white disabled:bg-slate-400"
                  >
                    إرسال
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {lightbox && (
          <button
            type="button"
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80"
            onClick={() => setLightbox(null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox} alt="" className="max-h-[90vh] max-w-[90vw] rounded-lg" />
          </button>
        )}
      </aside>
    </div>
  );
}
