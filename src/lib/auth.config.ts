import type { NextAuthConfig } from "next-auth";

/**
 * ส่วนที่ edge runtime (middleware) ใช้ได้ — ห้าม import prisma/bcrypt ที่นี่
 */
export const authConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;
      const isAuthPage = pathname === "/login" || pathname === "/register";
      const isProtected =
        pathname.startsWith("/dashboard") ||
        pathname.startsWith("/products") ||
        pathname.startsWith("/settings") ||
        pathname.startsWith("/profile");

      if (isAuthPage && isLoggedIn) {
        return Response.redirect(new URL("/dashboard", request.nextUrl));
      }
      if (isProtected && !isLoggedIn) return false;
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role?: string }).role ?? "USER";
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "ADMIN" | "USER";
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
