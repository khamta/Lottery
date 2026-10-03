import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { siteConfig } from "@/config/site";

/** โลโก้จริงของแอป (siteConfig.pwa.logo) เป็น data URI — อ่านครั้งเดียว ใช้ซ้ำทุกขนาด */
let logoDataUri: string | undefined;
function logoSrc() {
  logoDataUri ??= `data:image/png;base64,${readFileSync(join(process.cwd(), siteConfig.pwa.logo)).toString("base64")}`;
  return logoDataUri;
}

/**
 * วาดไอคอนแอป (โลโก้จริงบนพื้นสี primary ของธีม) เป็น PNG ตามขนาดที่ขอ
 * ใช้ร่วมกันทั้ง favicon, apple-icon และไอคอนใน manifest จะได้ไม่ต้องเก็บไฟล์รูปหลายขนาด
 *
 * maskable = พื้นเต็มกรอบ และโลโก้อยู่ใน safe zone กลางภาพ (Android ตัดขอบเป็นวงกลม/สี่เหลี่ยมมนเอง)
 */
export function renderAppIcon(size: number, { maskable = false }: { maskable?: boolean } = {}) {
  const logo = Math.round(size * (maskable ? 0.66 : 0.84));

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
        {/* eslint-disable-next-line @next/next/no-img-element -- satori วาดได้เฉพาะ <img> */}
        <img src={logoSrc()} alt="" width={logo} height={logo} />
      </div>
    ),
    { width: size, height: size },
  );
}

/**
 * ไอคอนที่ manifest อ้างถึง — เสิร์ฟจาก src/app/icons/[name]/route.tsx
 * หลายขนาดให้ทุกระบบเลือกขนาดที่คมที่สุด: Windows (taskbar/start 44–256), Android (192/512 + maskable),
 * macOS/ChromeOS (128–512)
 */
export const manifestIcons = {
  "icon-48.png": { size: 48, maskable: false },
  "icon-72.png": { size: 72, maskable: false },
  "icon-96.png": { size: 96, maskable: false },
  "icon-128.png": { size: 128, maskable: false },
  "icon-144.png": { size: 144, maskable: false },
  "icon-192.png": { size: 192, maskable: false },
  "icon-256.png": { size: 256, maskable: false },
  "icon-384.png": { size: 384, maskable: false },
  "icon-512.png": { size: 512, maskable: false },
  "maskable-192.png": { size: 192, maskable: true },
  "maskable-512.png": { size: 512, maskable: true },
} as const;

export type ManifestIconName = keyof typeof manifestIcons;

/**
 * จอ iPhone / iPad ที่ต้องมีภาพตอนเปิดแอป (apple-touch-startup-image)
 * iOS ไม่ใช้ manifest ทำ splash — ต้องมีภาพตรงขนาดจอเป๊ะทุกรุ่น ไม่งั้นจะเห็นจอขาวตอนเปิดแอป
 * [ความกว้าง CSS, ความสูง CSS, device pixel ratio] — เพิ่มรุ่นใหม่ต่อท้ายได้เลย
 */
const appleScreens = [
  // iPhone
  [440, 956, 3], // 16/17 Pro Max
  [420, 912, 3], // Air
  [402, 874, 3], // 16/17 Pro, 17
  [430, 932, 3], // 14 Pro Max, 15/16 Plus, 15 Pro Max
  [393, 852, 3], // 14 Pro, 15, 15 Pro, 16
  [428, 926, 3], // 12/13 Pro Max, 14 Plus
  [390, 844, 3], // 12, 13, 14, 16e
  [375, 812, 3], // X, XS, 11 Pro, 12/13 mini
  [414, 896, 3], // XS Max, 11 Pro Max
  [414, 896, 2], // XR, 11
  [414, 736, 3], // 6+/7+/8 Plus
  [375, 667, 2], // 6/7/8, SE 2/3
  [320, 568, 2], // SE 1
  // iPad
  [1032, 1376, 2], // Pro 13" (M4), Air 13"
  [1024, 1366, 2], // Pro 12.9"
  [834, 1210, 2], // Pro 11" (M4)
  [834, 1194, 2], // Pro 11"
  [820, 1180, 2], // Air 10.9", iPad 10
  [834, 1112, 2], // Air 10.5"
  [810, 1080, 2], // iPad 10.2"
  [768, 1024, 2], // iPad 9.7", mini 5
  [744, 1133, 2], // mini 6/7
] as const;

type SplashSpec = { width: number; height: number; dpr: number; dark: boolean; media: string };

/** ภาพ splash ทั้งหมด (ทุกรุ่น × แนวตั้ง/แนวนอน × สว่าง/มืด) — key คือชื่อไฟล์ใต้ /splash/ */
export const splashScreens: Record<string, SplashSpec> = Object.fromEntries(
  appleScreens.flatMap(([w, h, dpr]) =>
    (["portrait", "landscape"] as const).flatMap((orientation) =>
      [false, true].map((dark) => {
        const [width, height] = orientation === "portrait" ? [w * dpr, h * dpr] : [h * dpr, w * dpr];
        const media =
          `screen and (device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr})` +
          ` and (orientation: ${orientation}) and (prefers-color-scheme: ${dark ? "dark" : "light"})`;
        return [`${width}x${height}-${dark ? "dark" : "light"}.png`, { width, height, dpr, dark, media }];
      }),
    ),
  ),
);

/** สำหรับ metadata.appleWebApp.startupImage ใน layout */
export const appleStartupImages = Object.entries(splashScreens).map(([name, { media }]) => ({
  url: `/splash/${name}`,
  media,
}));

/**
 * วาดภาพตอนเปิดแอปบน iOS ให้หน้าตาเหมือน AppSplash (src/components/shared/app-splash.tsx)
 * — พื้นตามธีม, โลโก้บนกรอบสี primary 56px, ชื่อแอปด้านล่าง — เปลี่ยนต่อเป็น splash ในแอปได้เนียน
 */
export function renderSplash({ width, height, dpr, dark }: SplashSpec) {
  const px = (n: number) => Math.round(n * dpr);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: px(14),
          background: dark ? siteConfig.pwa.darkBackgroundColor : siteConfig.pwa.backgroundColor,
        }}
      >
        <div
          style={{
            width: px(56),
            height: px(56),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: px(16),
            background: siteConfig.pwa.brandColor,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- satori วาดได้เฉพาะ <img> */}
          <img src={logoSrc()} alt="" width={px(42)} height={px(42)} />
        </div>
        <div style={{ fontSize: px(15), fontWeight: 600, color: dark ? "#f5f5f5" : "#0a0a0a" }}>
          {siteConfig.name}
        </div>
        {/* ตำแหน่งเดียวกับแถบโหลดของ AppSplash จะได้ไม่กระโดดตอนสลับ */}
        <div style={{ width: px(160), height: px(3) }} />
      </div>
    ),
    { width, height },
  );
}
