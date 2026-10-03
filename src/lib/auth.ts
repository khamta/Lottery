import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";
import { loginSchema } from "@/lib/validations/auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      credentials: { identifier: {}, password: {} },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        // มี "@" = อีเมล (เทียบแบบไม่สนตัวพิมพ์ เพราะบัญชีเก่าอาจเก็บตัวใหญ่ไว้) · ไม่มี = username (เก็บตัวเล็กเสมอ)
        const { identifier } = parsed.data;
        const user = identifier.includes("@")
          ? await prisma.user.findFirst({ where: { email: { equals: identifier, mode: "insensitive" } } })
          : await prisma.user.findUnique({ where: { username: identifier } });
        if (!user?.password || !user.isActive) return null;

        const ok = await bcrypt.compare(parsed.data.password, user.password);
        if (!ok) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
        };
      },
    }),
    // เพิ่ม provider อื่นได้ที่นี่ เช่น Google, Azure AD, Keycloak
  ],
  // สถานะออนไลน์ (src/lib/presence.ts): login แล้วขึ้นทันที · logout แล้วหายทันที ไม่ต้องรอหมดเวลา
  events: {
    async signIn({ user }) {
      if (user.id) {
        await prisma.user
          .update({ where: { id: user.id }, data: { lastSeenAt: new Date() } })
          .catch(() => undefined);
      }
    },
    async signOut(message) {
      const id = "token" in message ? (message.token?.id as string | undefined) : message.session?.userId;
      if (id) {
        await prisma.user.update({ where: { id }, data: { lastSeenAt: null } }).catch(() => undefined);
      }
    },
  },
});

/** ใช้ใน server component / server action ที่ต้องมี session แน่ ๆ */
export async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  return session.user;
}

export async function requireRole(roles: Array<"ADMIN" | "USER">) {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new Error("FORBIDDEN");
  return user;
}
