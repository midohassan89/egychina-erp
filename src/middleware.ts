import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import {
  dashboardBlockRedirect,
  canUsePos,
  homeForRole,
} from "@/lib/auth/roles";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const role = req.auth?.user?.role;

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Public / token-auth routes (auth enforced inside handlers)
  if (
    pathname.startsWith("/price-checker") ||
    pathname.startsWith("/api/price-checker") ||
    pathname.startsWith("/api/store") ||
    pathname.startsWith("/api/customer") ||
    pathname.startsWith("/api/driver") ||
    (pathname === "/api/settings" && req.method === "GET")
  ) {
    return NextResponse.next();
  }

  // DRIVER — API-only (Bearer via /api/driver/*). Strictly no web dashboard/UI.
  if (role === "DRIVER") {
    if (pathname.startsWith("/api/driver")) {
      return NextResponse.next();
    }
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (pathname === "/login") {
      return NextResponse.next();
    }
    // Includes all /dashboard/* and every other web route
    return NextResponse.redirect(
      new URL("/login?error=driver-app-only", req.nextUrl.origin),
    );
  }

  if (!isLoggedIn && pathname !== "/login") {
    // API callers expect JSON 401 — not an HTML redirect to /login
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && (pathname === "/login" || pathname === "/")) {
    return NextResponse.redirect(
      new URL(homeForRole(role), req.nextUrl.origin),
    );
  }

  if (role === "CASHIER") {
    if (
      pathname.startsWith("/dashboard") ||
      pathname.startsWith("/accounting") ||
      pathname.startsWith("/reports") ||
      pathname.startsWith("/settings") ||
      pathname.startsWith("/products") ||
      pathname.startsWith("/customers") ||
      pathname.startsWith("/admin")
    ) {
      return NextResponse.redirect(new URL("/pos", req.nextUrl.origin));
    }
  }

  if (
    pathname.startsWith("/admin") &&
    role !== "ADMIN" &&
    role !== "MANAGER"
  ) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin));
  }

  if (pathname.startsWith("/pos") && !canUsePos(role)) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin));
  }

  if (pathname.startsWith("/dashboard")) {
    const blocked = dashboardBlockRedirect(role, pathname);
    if (blocked) {
      return NextResponse.redirect(new URL(blocked, req.nextUrl.origin));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
