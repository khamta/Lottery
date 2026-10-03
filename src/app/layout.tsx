import type { Metadata, Viewport } from "next";

import "./globals.css";
// สีของ project — ต้องโหลดหลัง globals.css เสมอ
import "@/styles/brand.css";
import { appFontStack, fontVariables } from "./fonts";
import { AppSplash } from "@/components/shared/app-splash";
import { Providers } from "@/components/providers";
import { siteConfig } from "@/config/site";
import { appleStartupImages } from "@/lib/pwa-icon";
import { getLocale } from "@/i18n/server";

export const metadata: Metadata = {
  title: { default: siteConfig.name, template: `%s | ${siteConfig.name}` },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  // ติดตั้งบน iOS ("เพิ่มไปยังหน้าจอโฮม") ให้เปิดแบบเต็มจอเหมือนแอป — manifest/ไอคอนดู src/app/manifest.ts
  // startupImage = ภาพตอนเปิดแอปบน iOS (ทุกรุ่น/แนว/ธีม) แทนจอขาว — ดู splashScreens ใน src/lib/pwa-icon.tsx
  appleWebApp: {
    capable: true,
    title: siteConfig.pwa.shortName,
    statusBarStyle: "default",
    startupImage: appleStartupImages,
  },
  formatDetection: { telephone: false },
};

/**
 * ตั้งค่าให้แสดงผลเต็มจอมือถือ (ชิดขอบ/ใต้รอยบาก)
 * แถบหัวหน้าต่าง PWA (เดสก์ท็อป) และแถบสถานะมือถือใช้สีหลักของแบรนด์ทั้งโหมดสว่าง/มืด
 * (meta theme-color จะ override theme_color ใน manifest จึงต้องตั้งให้ตรงกัน)
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: siteConfig.pwa.brandColor,
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
