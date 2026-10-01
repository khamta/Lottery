import { ImageResponse } from "next/og";

import { siteConfig } from "@/config/site";

/**
 * วาดไอคอนแอป (โลโก้เดียวกับหน้า splash) เป็น PNG ตามขนาดที่ขอ
 * ใช้ร่วมกันทั้ง favicon, apple-icon และไอคอนใน manifest จะได้ไม่ต้องเก็บไฟล์รูปหลายขนาด
 *
 * maskable = พื้นเต็มกรอบ และโลโก้อยู่ใน safe zone กลางภาพ (Android ตัดขอบเป็นวงกลม/สี่เหลี่ยมมนเอง)
 */
export function renderAppIcon(size: number, { maskable = false }: { maskable?: boolean } = {}) {
  const logo = Math.round(size * (maskable ? 0.45 : 0.6));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: siteConfig.pwa.brandColor,
          borderRadius: maskable ? 0 : Math.round(size * 0.22),
        }}
      >
        <svg width={logo} height={logo} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2">
          <path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z" strokeLinejoin="round" />
          <path d="m3 7 9 5 9-5M12 12v10" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}

/** ไอคอนที่ manifest อ้างถึง — เสิร์ฟจาก src/app/icons/[name]/route.tsx */
export const manifestIcons = {
  "icon-192.png": { size: 192, maskable: false },
  "icon-512.png": { size: 512, maskable: false },
  "maskable-512.png": { size: 512, maskable: true },
} as const;

export type ManifestIconName = keyof typeof manifestIcons;
