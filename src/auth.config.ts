import type { NextAuthConfig } from "next-auth";

export type AppRole =
  | "CASHIER"
  | "ACCOUNTANT"
  | "MANAGER"
  | "ADMIN"
  | "DRIVER";

/**
 * Edge-safe Auth.js config (no Prisma / Node APIs).
 * Used by middleware. Full providers live in `auth.ts`.
 */
export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (pathname.startsWith("/api/auth")) return true;
      if (pathname === "/login") return true;
      if (
        pathname.startsWith("/price-checker") ||
        pathname.startsWith("/api/price-checker") ||
        pathname.startsWith("/api/store") ||
        pathname.startsWith("/api/driver")
      ) {
        return true;
      }
      // Drivers must not use the web dashboard — only the mobile API.
      if (auth?.user?.role === "DRIVER") {
        return pathname === "/login";
      }
      return !!auth?.user;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.id === "string" ? token.id : "";
        session.user.role =
          typeof token.role === "string"
            ? (token.role as AppRole)
            : "CASHIER";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
