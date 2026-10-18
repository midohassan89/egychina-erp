"use client";

import { useCallback, useEffect, useState } from "react";

interface Thread {
  customerId: string;
  name: string | null;
  phone: string;
  lastText: string;
  unread: number;
}

interface ChatRow {
  id: string;
  senderRole: string;
  originalText: string;
  originalLang: string;
  textAr: string;
  textZh: string;
  createdAt: string;
}

export default function ChatPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [unread, setUnread] = useState(0);
  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [text, setText] = useState("");

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
    const body = (await res.json()) as { messages?: ChatRow[] };
    setMessages(body.messages ?? []);
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

  async function send() {
    if (!active || !text.trim()) return;
    const res = await fetch("/api/dashboard/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: active, text }),
    });
    if (!res.ok) return;
    setText("");
    await loadMessages(active);
  }

  return (
    <div className="grid h-[calc(100vh-8rem)] grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]" dir="rtl">
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
              <p>{message.textAr}</p>
              {message.senderRole === "CUSTOMER" && message.originalLang !== "ar" && (
                <p className="mt-1 text-xs opacity-70" dir="ltr">{message.originalText}</p>
              )}
            </article>
          ))}
        </div>
        <div className="flex gap-2 border-t border-slate-200 p-3 dark:border-gray-800">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="اكتب الرد بالعربية"
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
          <button type="button" onClick={() => void send()} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
            إرسال
          </button>
        </div>
      </section>
    </div>
  );
}
