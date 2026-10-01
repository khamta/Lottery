import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("next/navigation", () => ({
  usePathname: () => "/products",
  useSearchParams: () => new URLSearchParams(),
}));

const { startRouteProgress, finishRouteProgress, getRouteProgress } = await import(
  "@/components/shared/route-progress"
);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// เทสต์ไฟล์อื่นในรันเดียวกันอาจทิ้งแถบไว้ค้าง (store เป็น module-level) — ล้างก่อนทุกเคส
beforeEach(async () => {
  finishRouteProgress();
  await sleep(320);
});

afterEach(async () => {
  finishRouteProgress();
  await sleep(320);
});

describe("route progress (แถบโหลดด้านบน)", () => {
  test("ค่าเริ่มต้นคือซ่อนอยู่", () => {
    expect(getRouteProgress()).toBeNull();
  });

  test("start → แสดงแถบและเริ่มที่ค่ามากกว่า 0 แต่ยังไม่ถึง 100", () => {
    startRouteProgress();
    const value = getRouteProgress();

    expect(value).not.toBeNull();
    expect(value!).toBeGreaterThan(0);
    expect(value!).toBeLessThan(100);
  });

  test("start ซ้ำระหว่างวิ่งอยู่ ไม่รีเซ็ตค่ากลับไปเริ่มใหม่", async () => {
    startRouteProgress();
    await sleep(400); // ปล่อยให้ไต่ขึ้นไปสักพัก
    const before = getRouteProgress()!;

    startRouteProgress();
    expect(getRouteProgress()).toBe(before);
  });

  test("ไต่ขึ้นเรื่อย ๆ แต่ไม่เกิน 92 จนกว่าจะ finish", async () => {
    startRouteProgress();
    const first = getRouteProgress()!;
    await sleep(600);
    const later = getRouteProgress()!;

    expect(later).toBeGreaterThan(first);
    expect(later).toBeLessThanOrEqual(92);
  });

  test("finish → วิ่งไป 100 แล้วซ่อนตัวเอง", async () => {
    startRouteProgress();
    finishRouteProgress();
    expect(getRouteProgress()).toBe(100);

    await sleep(320);
    expect(getRouteProgress()).toBeNull();
  });

  test("finish ตอนที่ยังไม่ได้ start ไม่ทำอะไร", () => {
    finishRouteProgress();
    expect(getRouteProgress()).toBeNull();
  });
});
