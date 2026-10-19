"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { playAttentionChime } from "@/lib/pos/errorBeep";

export interface PosDeskOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  phone: string;
  address: string;
  notes: string | null;
  totalAmount: number;
  status: string;
  createdAt: string;
  assignedDriverId: string | null;
  assignedDriverName: string | null;
  items: { id: string; name: string; quantity: number; price: number }[];
}

export interface PosDeskDriver {
  id: string;
  username: string;
}

export interface PosDeskThread {
  customerId: string;
  name: string | null;
  phone: string;
  lastText: string;
  lastAt: string;
  unread: number;
}

const OPEN_STATUSES = new Set(["PENDING", "CONFIRMED", "PREPARING", "SHIPPED"]);

export function usePosDesk(onToast: (message: string) => void) {
  const [orders, setOrders] = useState<PosDeskOrder[]>([]);
  const [drivers, setDrivers] = useState<PosDeskDriver[]>([]);
  const [threads, setThreads] = useState<PosDeskThread[]>([]);
  const [chatUnread, setChatUnread] = useState(0);
  const toastRef = useRef(onToast);
  toastRef.current = onToast;
  const seenOrders = useRef<Set<string> | null>(null);
  const seenUnread = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    try {
      const [orderRes, chatRes] = await Promise.all([
        fetch("/api/pos/online-orders", { cache: "no-store" }),
        fetch("/api/dashboard/chat", { cache: "no-store" }),
      ]);
      if (orderRes.ok) {
        const body = (await orderRes.json()) as {
          orders?: PosDeskOrder[];
          drivers?: PosDeskDriver[];
        };
        const next = body.orders ?? [];
        setOrders(next);
        setDrivers(body.drivers ?? []);
        const pending = next.filter((order) => order.status === "PENDING").map((order) => order.id);
        if (seenOrders.current == null) {
          seenOrders.current = new Set(pending);
        } else {
          const fresh = pending.filter((id) => !seenOrders.current!.has(id));
          seenOrders.current = new Set(pending);
          if (fresh.length > 0) {
            playAttentionChime();
            toastRef.current(
              fresh.length === 1 ? "طلب أونلاين جديد" : `${fresh.length} طلبات أونلاين جديدة`,
            );
          }
        }
      }
      if (chatRes.ok) {
        const body = (await chatRes.json()) as {
          unread?: number;
          threads?: PosDeskThread[];
        };
        const unread = body.unread ?? 0;
        setThreads(body.threads ?? []);
        setChatUnread(unread);
        if (seenUnread.current == null) {
          seenUnread.current = unread;
        } else if (unread > seenUnread.current) {
          playAttentionChime();
          toastRef.current("رسالة جديدة من عميل");
          seenUnread.current = unread;
        } else {
          seenUnread.current = unread;
        }
      }
    } catch {
      // Offline or a brief server restart. The register keeps selling.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 12_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const openOrderCount = orders.filter((order) => OPEN_STATUSES.has(order.status)).length;

  return { orders, drivers, threads, chatUnread, openOrderCount, refresh };
}
