import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // ส่งออกโพย (src/lottery/ticket-export.ts) — pdfkit อ่านไฟล์ข้อมูลของตัวเองจาก node_modules ตอนรัน ห้าม bundle
  serverExternalPackages: ["pdfkit", "exceljs"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  // service worker ต้องไม่ถูก cache ไม่งั้นเบราว์เซอร์จะไม่เห็นเวอร์ชันใหม่
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
