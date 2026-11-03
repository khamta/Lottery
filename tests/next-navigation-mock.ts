/**
 * preload ของ project (bunfig.toml — ต่อจาก tests/setup.ts ของ template) — next/navigation ปลอมที่ครบทุกตัวเสมอ
 *
 * mock.module ของ bun แทนที่โมดูลทั้งโปรเซส (ทุกไฟล์เทสต์ที่รันต่อกัน) — tests/unit/route-progress.test.ts (core ของ template)
 * mock ไม่ครบ (ไม่มี useRouter) CI บน Linux จึงพัง "Export named 'useRouter' not found in module next/navigation.js"
 * ตามลำดับไฟล์ ซึ่งต่างจากเครื่อง Windows ที่รันผ่าน
 *
 * ไฟล์เทสต์เป็น core แก้ใน project ไม่ได้ (docs/EXTENDING.md) จึงแก้ที่นี่:
 *   1. ลงของปลอมครบชุดตั้งแต่ต้น — เทสต์ไม่โหลด next/navigation ตัวจริง (CJS) เลย
 *   2. ทุก mock.module("next/navigation", …) ของไฟล์อื่นถูกเติมตัวที่ขาดจากชุดนี้
 * ลบไฟล์นี้ได้เมื่อ template แก้ route-progress.test.ts ให้ mock ครบแล้ว
 */
import { mock } from "bun:test";

const defaults = () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
});

const original = mock.module.bind(mock);
mock.module = ((id: string, factory: () => Record<string, unknown>) =>
  original(id, id === "next/navigation" ? () => ({ ...defaults(), ...factory() }) : factory)) as typeof mock.module;

mock.module("next/navigation", defaults);
