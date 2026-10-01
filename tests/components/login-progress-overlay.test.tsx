import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";

import {
  FINISH_MS,
  HOLD_MS,
  LoginProgressOverlay,
  loginProgressAt,
  loginProgressStatusKey,
  RAMP_MS,
  RAMP_TARGET,
} from "@/components/shared/login-progress-overlay";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function wait(ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 25) {
    await act(() => sleep(25));
  }
}

afterEach(cleanup);

describe("loginProgressAt", () => {
  test("เริ่ม 0, ถึง ~90 เมื่อจบช่วงเร่ง, ไม่เกิน 100 และเพิ่มขึ้นตลอด", () => {
    expect(loginProgressAt(0)).toBe(0);
    expect(loginProgressAt(RAMP_MS)).toBeCloseTo(RAMP_TARGET, 0);
    expect(loginProgressAt(HOLD_MS - 1)).toBeLessThan(100);
    expect(loginProgressAt(HOLD_MS + FINISH_MS)).toBe(100);

    let previous = -1;
    for (let t = 0; t <= HOLD_MS + FINISH_MS; t += 10) {
      const value = loginProgressAt(t);
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value).toBeLessThanOrEqual(100);
      previous = value;
    }
  });

  test("ข้อความสถานะเปลี่ยนตามช่วง", () => {
    expect(loginProgressStatusKey(5)).toBe("auth.progressVerifying");
    expect(loginProgressStatusKey(50)).toBe("auth.progressLoadingData");
    expect(loginProgressStatusKey(90)).toBe("auth.progressPreparing");
    expect(loginProgressStatusKey(100)).toBe("auth.progressReady");
  });
});

describe("<LoginProgressOverlay />", () => {
  test("ไม่ active = ไม่ render อะไร", () => {
    render(<LoginProgressOverlay active={false} />);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  test("วิ่งถึง 100% แล้วเรียก onFinish ครั้งเดียว", async () => {
    let calls = 0;
    render(<LoginProgressOverlay active onFinish={() => calls++} />);

    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");

    await wait(HOLD_MS + FINISH_MS + 200);

    expect(bar.getAttribute("aria-valuenow")).toBe("100");
    expect(calls).toBe(1);
  });
});
