"use client";

import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPos = pathname === "/pos";
  const isLogin = pathname === "/login";
  const isDashboard = pathname.startsWith("/dashboard");

  // Bare layouts — no legacy AppShell chrome
  if (isPos || isLogin || isDashboard) {
    return (
      <div
        className={clsx(
          isPos &&
            "flex h-screen overflow-hidden bg-slate-900 print:h-auto print:overflow-visible print:bg-white",
          isLogin && "min-h-screen",
          isDashboard && "min-h-screen",
        )}
      >
        <main
          className={clsx(
            "min-w-0 flex-1",
            isPos &&
              "min-h-0 overflow-hidden print:overflow-visible",
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
