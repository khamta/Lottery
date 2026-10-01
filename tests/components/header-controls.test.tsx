import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

let resolvedTheme = "light";
const setThemeCalls: string[] = [];

mock.module("next-themes", () => ({
  useTheme: () => ({
    resolvedTheme,
    setTheme: (value: string) => setThemeCalls.push(value),
  }),
}));

// next/image ต้องมี config ของ Next — ในเทสต์ใช้ <img> ธรรมดาแทน
mock.module("next/image", () => ({
  default: ({ src, alt, className }: { src: string; alt: string; className?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} />
  ),
}));

const { ThemeToggle } = await import("@/components/theme-toggle");
const { LanguageSwitcher } = await import("@/components/layout/language-switcher");
const { getInitials } = await import("@/components/shared/user-avatar");

afterEach(() => {
  cleanup();
  setThemeCalls.length = 0;
});

describe("<ThemeToggle /> (กดครั้งเดียวสลับสว่าง ⇄ มืด)", () => {
  test("ตอนนี้สว่าง → กดแล้วเป็นมืด", () => {
    resolvedTheme = "light";
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button"));
    expect(setThemeCalls).toEqual(["dark"]);
  });

  test("ตอนนี้มืด → กดแล้วเป็นสว่าง", () => {
    resolvedTheme = "dark";
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button"));
    expect(setThemeCalls).toEqual(["light"]);
  });
});

describe("<LanguageSwitcher />", () => {
  test("ปุ่มแสดงธงของภาษาปัจจุบัน (ค่าเริ่มต้น = ลาว)", () => {
    render(<LanguageSwitcher />);
    const flag = screen.getByRole("button").querySelector("img");
    expect(flag?.getAttribute("src")).toBe("/img/la.png");
  });
});

describe("getInitials (อักษรย่อเมื่อไม่มีรูปโปรไฟล์)", () => {
  test("ชื่อหลายคำใช้อักษรแรกของคำแรกและคำสุดท้าย", () => {
    expect(getInitials("John Ronald Smith")).toBe("JS");
  });

  test("ชื่อคำเดียวใช้ 2 ตัวแรก / ไม่มีชื่อใช้อีเมล", () => {
    expect(getInitials("admin")).toBe("AD");
    expect(getInitials(null, "kim@example.com")).toBe("KI");
    expect(getInitials("   ", null)).toBe("U");
  });
});
