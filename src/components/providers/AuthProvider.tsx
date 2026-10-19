"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SessionProvider, useSession } from "next-auth/react";

function SessionWatch() {
  const { status } = useSession();
  const pathname = usePathname() ?? "";
  const router = useRouter();

  useEffect(() => {
    if (status !== "unauthenticated") return;
    if (
      pathname.startsWith("/login") ||
      pathname.startsWith("/price-checker") ||
      pathname.startsWith("/uploads")
    ) {
      return;
    }
    router.replace("/login");
  }, [pathname, router, status]);

  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchInterval={60} refetchOnWindowFocus>
      <SessionWatch />
      {children}
    </SessionProvider>
  );
}
