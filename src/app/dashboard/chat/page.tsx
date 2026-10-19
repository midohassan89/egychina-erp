"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Thread {
  customerId: string;
  name: string | null;
  phone: string;
  lastText: string;
  unread: number;
}

interface CustomerCard {
  phone: string;
  pointsBalance: number;
  orders: { id: string; orderNumber: string; status: string; createdAt: string }[];
}

const STATUS_AR: Record<string, string> = {
  PENDING: "قيد الانتظار",
  CONFIRMED: "مؤكد",
  PREPARING: "جاري التجهيز",
  SHIPPED: "في الطريق",
  DELIVERED: "تم التسليم",
  COMPLETED: "مكتمل",
  CANCELLED: "ملغي",
  RETURNED: "مرتجع",
  PARTIALLY_RETURNED: "مرتجع جزئي",
};

interface ChatRow {
  id: string;
  senderRole: string;
  originalText: string;
  originalLang: string;
  textAr: string;
  textZh: string;
  attachmentUrl?: string | null;
  attachmentType?: string | null;
  createdAt: string;
}

const CANNED = [
  "جاري تجهيز طلبك الآن",
  "السائق في الطريق إليك",
  "تم استلام الصورة وجاري المراجعة",
];

export default function ChatPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [unread, setUnread] = useState(0);
  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [customer, setCustomer] = useState<CustomerCard | null>(null);
  const [text, setText] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);

  const loadThreads = useCallback(async () => {
    const res = await fetch("/api/dashboard/chat", { cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as { threads?: Thread[]; unread?: number };
    setThreads(body.threads ?? []);
    setUnread(body.unread ?? 0);
  }, []);

  const loadMessages = useCallback(async (customerId: string) => {
    const res = await fetch(`/api/dashboard/chat?customerId=${customerId}`, { cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as { messages?: ChatRow[]; customer?: CustomerCard | null };
    setMessages(body.messages ?? []);
    setCustomer(body.customer ?? null);
  }, []);

  useEffect(() => {
    void loadThreads();
    const timer = window.setInterval(() => void loadThreads(), 8000);
    return () => window.clearInterval(timer);
  }, [loadThreads]);

  useEffect(() => {
    if (!active) return;
    void loadMessages(active);
    const timer = window.setInterval(() => void loadMessages(active), 8000);
    return () => window.clearInterval(timer);
  }, [active, loadMessages]);

  function chooseFile(file: File | null) {
    setPendingFile(file);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    });
  }

  async function send(reply = text, includeFile = true) {
    if (!active || sending) return;
    const caption = reply.trim();
    const file = includeFile ? pendingFile : null;
    if (!caption && !file) return;
    setSending(true);
    try {
      let attachmentUrl: string | null = null;
      let attachmentType: string | null = null;
      if (file) {
        const form = new FormData();
        form.set("file", file);
        const uploaded = await fetch("/api/dashboard/chat/upload", { method: "POST", body: form });
        const saved = (await uploaded.json()) as { url?: string; attachmentType?: string; error?: string };
        if (!uploaded.ok || !saved.url) return;
        attachmentUrl = saved.url;
        attachmentType = saved.attachmentType ?? "FILE";
      }
      const res = await fetch("/api/dashboard/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: active, text: caption, attachmentUrl, attachmentType }),
      });
      if (!res.ok) return;
      if (includeFile) {
        setText("");
        chooseFile(null);
      }
      await loadMessages(active);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid h-[calc(100vh-8rem)] grid-cols-1 gap-4 lg:grid-cols-[280px_1fr_240px]" dir="rtl">
      <aside className="overflow-y-auto rounded-2xl border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-gray-800">
          <h1 className="font-bold text-slate-900 dark:text-gray-100">المحادثات</h1>
          <p className="text-xs text-slate-500 dark:text-gray-400">غير مقروء: {unread}</p>
        </div>
        {threads.length === 0 ? (
          <p className="px-4 py-8 text-sm text-slate-400">لا توجد رسائل بعد</p>
        ) : (
          threads.map((thread) => (
            <button
              key={thread.customerId}
              type="button"
              onClick={() => setActive(thread.customerId)}
              className={`block w-full border-b border-slate-100 px-4 py-3 text-right dark:border-gray-800 ${active === thread.customerId ? "bg-slate-50 dark:bg-gray-800" : ""}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-900 dark:text-gray-100">{thread.name || thread.phone}</span>
                {thread.unread > 0 && (
                  <span className="rounded-full bg-orange-500 px-2 text-xs text-white">{thread.unread}</span>
                )}
              </span>
              <span className="mt-1 block truncate text-xs text-slate-500">{thread.lastText}</span>
            </button>
          ))
        )}
      </aside>
      <section className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.map((message) => (
            <article
              key={message.id}
              className={`max-w-xl rounded-2xl px-3 py-2 text-sm ${message.senderRole === "ADMIN" ? "ms-auto bg-brand-600 text-white" : "bg-slate-100 text-slate-900 dark:bg-gray-800 dark:text-gray-100"}`}
            >
              {message.textAr && <p>{message.textAr}</p>}
              {message.attachmentUrl && message.attachmentType === "IMAGE" && (
                <button type="button" onClick={() => setLightbox(message.attachmentUrl ?? null)}>
                  <img src={message.attachmentUrl} alt="" className="mt-2 max-h-48 rounded-xl" />
                </button>
              )}
              {message.attachmentUrl && message.attachmentType !== "IMAGE" && (
                <a href={message.attachmentUrl} className="mt-2 block underline" target="_blank" rel="noreferrer">
                  ملف مرفق
                </a>
              )}
              {message.senderRole === "CUSTOMER" && message.originalLang !== "ar" && message.originalText && (
                <p className="mt-1 text-xs opacity-70" dir="ltr">{message.originalText}</p>
              )}
            </article>
          ))}
        </div>
        <div className="border-t border-slate-200 p-3 dark:border-gray-800">
          <div className="mb-2 flex flex-wrap gap-2">
            {CANNED.map((reply) => (
              <button
                key={reply}
                type="button"
                disabled={!active || sending}
                onClick={() => void send(reply, false)}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40 dark:bg-gray-800 dark:text-gray-200"
              >
                {reply}
              </button>
            ))}
          </div>
          {previewUrl && (
            <img src={previewUrl} alt="" className="mb-2 h-20 rounded-xl object-cover" />
          )}
          {pendingFile && !previewUrl && (
            <p className="mb-2 text-xs text-slate-500">{pendingFile.name}</p>
          )}
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept="image/*,.pdf,.txt" className="hidden" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} />
            <button type="button" onClick={() => fileRef.current?.click()} className="rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-gray-700" aria-label="إرفاق صورة أو ملف">📎</button>
            <button type="button" onClick={() => cameraRef.current?.click()} className="rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-gray-700" aria-label="التقاط صورة">📷</button>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="اكتب الرد بالعربية"
              className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
            <button type="button" disabled={sending} onClick={() => void send()} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
              إرسال
            </button>
          </div>
        </div>
        {lightbox && (
          <button type="button" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6" onClick={() => setLightbox(null)}>
            <img src={lightbox} alt="" className="max-h-full max-w-full rounded-xl" />
          </button>
        )}
      </section>
      <aside className="overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="font-bold text-slate-900 dark:text-gray-100">بيانات العميل</h2>
        {!customer ? (
          <p className="mt-3 text-sm text-slate-400">اختر محادثة</p>
        ) : (
          <div className="mt-3 space-y-3 text-sm">
            <p className="text-slate-700 dark:text-gray-200" dir="ltr">{customer.phone}</p>
            <p className="text-slate-700 dark:text-gray-200">النقاط: {customer.pointsBalance.toLocaleString("ar-EG")}</p>
            <div>
              <p className="mb-1 font-semibold text-slate-900 dark:text-gray-100">آخر الطلبات</p>
              {customer.orders.length === 0 ? (
                <p className="text-slate-400">لا توجد طلبات</p>
              ) : (
                customer.orders.map((order) => (
                  <p key={order.id} className="text-slate-600 dark:text-gray-300">
                    {order.orderNumber} · {STATUS_AR[order.status] ?? order.status}
                  </p>
                ))
              )}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
