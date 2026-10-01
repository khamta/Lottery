import { describe, expect, test } from "bun:test";

import manifest from "@/app/manifest";
import { siteConfig } from "@/config/site";
import { manifestIcons } from "@/lib/pwa-icon";

const sw = await Bun.file("public/sw.js").text();
const middleware = await Bun.file("src/middleware.ts").text();

describe("PWA", () => {
  const m = manifest();

  test("manifest มีค่าที่เบราว์เซอร์ต้องใช้ในการติดตั้ง", () => {
    expect(m.name).toBe(siteConfig.name);
    expect(m.short_name).toBeTruthy();
    expect(m.start_url).toBe(siteConfig.pwa.startUrl);
    expect(m.display).toBe("standalone");
  });

  test("มีไอคอน 192 และ 512 และแบบ maskable", () => {
    const sizes = m.icons?.map((icon) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(m.icons?.some((icon) => icon.purpose === "maskable")).toBe(true);
    for (const icon of m.icons ?? []) {
      expect(Object.keys(manifestIcons)).toContain(icon.src.replace("/icons/", ""));
    }
  });

  test("service worker ไม่ cache หน้าเพจ/API — มีแค่หน้า /offline สำรอง", () => {
    expect(sw).toContain('const OFFLINE_URL = "/offline"');
    expect(sw).toContain('request.method !== "GET"');
    expect(sw).not.toContain("/api/");
  });

  test("middleware ไม่ดักไฟล์ของ PWA", () => {
    expect(middleware).toContain("sw.js");
    expect(middleware).toContain("manifest.webmanifest");
    expect(middleware).toContain("icons/");
  });
});
