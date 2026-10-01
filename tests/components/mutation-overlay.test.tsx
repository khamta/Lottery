import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";

import {
  beginMutation,
  beginProgress,
  COMPLETE_HOLD_MS,
  TRICKLE_MS,
  getPendingMutations,
  MutationOverlay,
  MIN_VISIBLE_MS,
  SHOW_DELAY_MS,
  FADE_MS,
} from "@/components/shared/mutation-overlay";
import { defaultLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// เดินเวลาเป็นช่วงสั้น ๆ — ใน act() เดียว React จะเลื่อน render ไปจนจบ scope
// ทำให้ timer ที่ต่อกันเป็นทอด (visible → leaving → hidden) ไม่ขยับ
async function wait(ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 25) {
    await act(() => sleep(25));
  }
}
const overlayState = () => document.querySelector("[data-state]")?.getAttribute("data-state") ?? null;

const pending: Array<() => void> = [];
function start(labelKey?: string) {
  const end = beginMutation(labelKey);
  pending.push(end);
  return end;
}

afterEach(() => {
  pending.splice(0).forEach((end) => end());
  cleanup();
});

describe("beginMutation (store)", () => {
  test("นับงานค้างแบบ counter และปิดเมื่องานสุดท้ายจบ", () => {
    const a = start();
    const b = start();
    expect(getPendingMutations()).toBe(2);

    a();
    expect(getPendingMutations()).toBe(1);
    b();
    expect(getPendingMutations()).toBe(0);
  });

  test("เรียก end ซ้ำไม่นับซ้อน", () => {
    const a = start();
    const b = start();
    a();
    a();
    expect(getPendingMutations()).toBe(1);
    b();
  });
});

describe("<MutationOverlay />", () => {
  test("งานที่เสร็จเร็วกว่า show-delay ไม่ทำให้ม่านโผล่ (กันกระพริบ)", async () => {
    render(<MutationOverlay />);
    const end = start();
    await wait(SHOW_DELAY_MS / 3);
    act(() => end());
    await wait(SHOW_DELAY_MS + 50);

    expect(overlayState()).toBeNull();
  });

  test("งานนานพอ → ม่านโผล่พร้อมข้อความแปลแล้ว และหายไปหลังงานจบ", async () => {
    render(<MutationOverlay />);
    const end = start("common.deleting");
    await wait(SHOW_DELAY_MS + 50);

    expect(overlayState()).toBe("open");
    expect(document.querySelector("[data-state]")?.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("status").textContent).toBe(dictionaries[defaultLocale].common.deleting);

    act(() => end());
    // ค้างอย่างน้อย MIN_VISIBLE_MS ไม่วาบหายทันที
    await wait(50);
    expect(overlayState()).toBe("open");

    await wait(MIN_VISIBLE_MS + FADE_MS + 100);
    expect(overlayState()).toBeNull();
  });
});

describe("beginProgress", () => {
  const percent = () => Number(screen.queryByRole("progressbar")?.getAttribute("aria-valuenow") ?? NaN);

  test("วิ่ง % เองระหว่างรอ ไม่ถึง 100 จนกว่างานจบ แล้วค้าง 100% ก่อนปิด", async () => {
    render(<MutationOverlay />);
    const upload = beginProgress();
    pending.push(upload.end);
    await wait(SHOW_DELAY_MS + TRICKLE_MS * 3);

    expect(overlayState()).toBe("open");
    expect(percent()).toBeGreaterThan(0);
    expect(percent()).toBeLessThan(100);

    act(() => upload.end());
    await wait(25);
    expect(percent()).toBe(100);
    expect(getPendingMutations()).toBe(1);

    await wait(COMPLETE_HOLD_MS + 50);
    expect(getPendingMutations()).toBe(0);
  });

  test("set() ใช้ค่าจริง ไม่ถอยหลัง และไม่เกิน 99 ก่อน end()", async () => {
    render(<MutationOverlay />);
    const upload = beginProgress();
    pending.push(upload.end);
    await wait(SHOW_DELAY_MS + 50);

    act(() => upload.set(40));
    await wait(TRICKLE_MS * 2);
    expect(percent()).toBe(40);

    act(() => upload.set(10));
    expect(percent()).toBe(40);

    act(() => upload.set(150));
    expect(percent()).toBe(99);
  });
});
