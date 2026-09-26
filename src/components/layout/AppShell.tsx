"use client";

import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const isPos = pathname === "/pos";
  const isLogin = pathname === "/login";
  const isDashboard =
    pathname.startsWith("/dashboard") || pathname.startsWith("/admin");
  const isPriceChecker = pathname.startsWith("/price-checker");

  // Bare layouts — no legacy AppShell chrome
  if (isPos || isLogin || isDashboard || isPriceChecker) {
    return (
      <div
        className={clsx(
          isPos &&
            "flex h-screen overflow-hidden bg-slate-900 print:h-auto print:overflow-visible print:bg-white",
          isLogin && "min-h-screen",
          isDashboard && "min-h-screen",
          isPriceChecker &&
            "flex h-screen min-h-dvh w-full flex-col overflow-hidden bg-slate-950",
        )}
      >
        <main
          className={clsx(
            "min-w-0 flex-1",
            isPos &&
              "min-h-0 overflow-hidden print:overflow-visible",
            isPriceChecker && "flex h-full min-h-0 w-full flex-col overflow-hidden",
          )}
        >
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar currentPath={pathname} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
