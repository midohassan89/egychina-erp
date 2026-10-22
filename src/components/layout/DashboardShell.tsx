"use client";

import { Bell, Search } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Sidebar } from "@/components/layout/Sidebar";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export function DashboardShell({
  children,
  username,
  role,
}: {
  children: React.ReactNode;
  username: string;
  role: string;
}) {
  return (
    <div dir="rtl" className="flex h-screen overflow-hidden bg-slate-100 dark:bg-gray-950 dark:text-gray-100">
      <Sidebar username={username} role={role} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="dashboard-no-print flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-6 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100">
          <div className="flex min-w-0 items-center gap-3">
            <BrandLogo className="h-10 w-auto max-w-[9rem] object-contain lg:hidden dark:rounded-md dark:bg-white dark:px-1.5" />
            <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-gray-100">
              مرحباً، {username}
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-gray-400">{role}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-gray-500" />
              <input
                type="search"
                readOnly
                tabIndex={-1}
                placeholder="البحث..."
                className="w-48 rounded-lg border border-slate-200 bg-slate-50 py-2 pe-3 ps-9 text-sm text-slate-600 outline-none placeholder:text-slate-400 focus:border-orange-500 focus:bg-white lg:w-64 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:bg-gray-800"
              />
            </div>
            <ThemeToggle />
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              title="الإشعارات"
            >
              <Bell className="h-4 w-4" />
              الإشعارات
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto p-4 transition-all duration-300 sm:p-6 print:p-0 dark:text-gray-100">
          {children}
        </main>
      </div>
    </div>
  );
}
