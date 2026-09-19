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

  if (!isLoggedIn && pathname !== "/login") {
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
      pathname.startsWith("/customers")
    ) {
      return NextResponse.redirect(new URL("/pos", req.nextUrl.origin));
    }
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
