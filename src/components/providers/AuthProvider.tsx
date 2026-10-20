"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SessionProvider, signOut, useSession } from "next-auth/react";
import { DASHBOARD_SESSION_MS } from "@/lib/auth/sessionPolicy";

function SessionWatch() {
  const { data: session, status, update } = useSession();
  const pathname = usePathname() ?? "";
  const router = useRouter();

  const onPos = pathname === "/pos" || pathname.startsWith("/pos/");
  const isCashier = session?.user?.role === "CASHIER";
  /** Cashier role or the /pos screen: never auto-logout; only manual "خروج". */
  const staySignedIn = onPos || isCashier;
  const onDashboard =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/print");

  // Keep POS / cashier sessions warm so the cookie slides forward.
  useEffect(() => {
    if (!staySignedIn || status !== "authenticated") return;
    const timer = window.setInterval(() => {
      void update();
    }, 15 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [staySignedIn, status, update]);

  // Dashboard only (non-cashier): absolute 12-hour logout from login time.
  useEffect(() => {
    if (staySignedIn || isCashier) return;
    if (!onDashboard && pathname !== "/") return;
    if (status !== "authenticated") return;
    const loginAt = session?.loginAt;
    if (typeof loginAt !== "number" || loginAt <= 0) return;

    const remaining = DASHBOARD_SESSION_MS - (Date.now() - loginAt);
    if (remaining <= 0) {
      void signOut({ callbackUrl: "/login" });
      return;
    }
    const timer = window.setTimeout(() => {
      void signOut({ callbackUrl: "/login" });
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [
    staySignedIn,
    isCashier,
    onDashboard,
    pathname,
    status,
    session?.loginAt,
  ]);

  useEffect(() => {
    if (status !== "unauthenticated") return;
    if (
      pathname.startsWith("/login") ||
      pathname.startsWith("/price-checker") ||
      pathname.startsWith("/uploads")
    ) {
      return;
    }
    // Never bounce the register on a session flicker — cashier signs out manually.
    if (staySignedIn) return;
    router.replace("/login");
  }, [pathname, router, status, staySignedIn]);

  return null;
}

function AuthSessionRoot({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const onPos = pathname === "/pos" || pathname.startsWith("/pos/");
  const refetchInterval = useMemo(() => (onPos ? 5 * 60 : 60), [onPos]);

  return (
    <SessionProvider
      refetchInterval={refetchInterval}
      refetchOnWindowFocus={!onPos}
    >
      <SessionWatch />
      {children}
    </SessionProvider>
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <AuthSessionRoot>{children}</AuthSessionRoot>;
}
