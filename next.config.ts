import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // เปิด dev จากเครื่องอื่นในวง LAN/WiFi เดียวกัน (bun run dev ฟังที่ 0.0.0.0) — ไม่งั้น HMR / _next ถูกบล็อก
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
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
