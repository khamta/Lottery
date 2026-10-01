import { describe, expect, test } from "bun:test";

import { HEARTBEAT_MS, ONLINE_WINDOW_MS, isOnline, onlineSince } from "@/lib/presence";

const now = new Date("2026-09-24T10:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("isOnline", () => {
  test("heartbeat เพิ่งส่ง → ออนไลน์", () => {
    expect(isOnline(ago(5_000), now)).toBe(true);
  });

  test("พลาด heartbeat ไป 1 รอบ ยังนับว่าออนไลน์", () => {
    expect(isOnline(ago(HEARTBEAT_MS * 2), now)).toBe(true);
  });

  test("เกินหน้าต่างเวลา → ออฟไลน์", () => {
    expect(isOnline(ago(ONLINE_WINDOW_MS + 1), now)).toBe(false);
  });

  test("null (logout แล้ว/ไม่เคยเข้า) → ออฟไลน์", () => {
    expect(isOnline(null, now)).toBe(false);
    expect(isOnline(undefined, now)).toBe(false);
  });

  test("รับ ISO string ได้เหมือน Date", () => {
    expect(isOnline(ago(1_000).toISOString(), now)).toBe(true);
  });
});

describe("onlineSince", () => {
  test("ย้อนหลังเท่ากับ ONLINE_WINDOW_MS", () => {
    expect(onlineSince(now).getTime()).toBe(now.getTime() - ONLINE_WINDOW_MS);
  });
});
