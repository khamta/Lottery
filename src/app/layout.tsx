import type { Metadata, Viewport } from "next";

import "./globals.css";
// สีของ project — ต้องโหลดหลัง globals.css เสมอ
import "@/styles/brand.css";
import { appFontStack, fontVariables } from "./fonts";
import { AppSplash } from "@/components/shared/app-splash";
import { Providers } from "@/components/providers";
import { siteConfig } from "@/config/site";
import { getLocale } from "@/i18n/server";

export const metadata: Metadata = {
  title: { default: siteConfig.name, template: `%s | ${siteConfig.name}` },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  // ติดตั้งบน iOS ("เพิ่มไปยังหน้าจอโฮม") ให้เปิดแบบเต็มจอเหมือนแอป — manifest/ไอคอนดู src/app/manifest.ts
  appleWebApp: { capable: true, title: siteConfig.pwa.shortName, statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

/** ตั้งค่าให้แสดงผลเต็มจอมือถือ (ชิดขอบ/ใต้รอยบาก) และแถบสถานะเปลี่ยนสีตามธีม */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1f26" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();

  return (
    // ตัวแปรฟอนต์ทั้งหมดต้องอยู่ที่ <html> เพราะ --font-sans ถูกประกาศที่ :root
    // ถ้าไปตั้งที่ <body> ตัวแปรจะ resolve ไม่เจอ แล้วฟอนต์จะไม่ถูกใช้
    // ชุดฟอนต์เป็นชุดเดียวทั้งระบบ — เบราว์เซอร์เลือกให้เองรายตัวอักษร (ดู src/app/fonts.ts)
    <html
      lang={locale}
      data-locale={locale}
      className={fontVariables}
      style={{ ["--font-app-sans" as string]: appFontStack }}
      suppressHydrationWarning
    >
      <body className="min-h-dvh antialiased">
        {/* เห็นทันทีตอน hard reload แล้วจางออกเมื่อแอปพร้อม (ดู #app-splash ใน globals.css) */}
        <AppSplash name={siteConfig.name} />
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
