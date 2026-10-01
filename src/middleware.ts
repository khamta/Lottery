import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// middleware ใช้เฉพาะ authConfig (edge-safe) ไม่แตะ prisma
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // ไฟล์ของ PWA (sw.js, manifest, ไอคอน) ต้องโหลดได้โดยไม่ผ่าน auth
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
