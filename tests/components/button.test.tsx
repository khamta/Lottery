import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";

import { Button } from "@/components/ui/button";

afterEach(cleanup);

describe("<Button />", () => {
  test("แสดงข้อความที่ส่งเข้าไป", () => {
    render(<Button>บันทึก</Button>);
    expect(screen.getByRole("button", { name: "บันทึก" })).toBeDefined();
  });

  // loading ใช้กับงานที่ไม่ใช่ CRUD เท่านั้น (เช่น login) — CRUD ใช้ <MutationOverlay /> เต็มจอ
  test("loading = true → ปุ่มถูกปิดและมี aria-busy", () => {
    render(<Button loading>กำลังบันทึก</Button>);
    const button = screen.getByRole("button");
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
  });

  test("variant destructive ใส่ class จาก design token", () => {
    render(<Button variant="destructive">ลบ</Button>);
    expect(screen.getByRole("button").className).toContain("bg-destructive");
  });

  test("asChild render เป็น element อื่นได้", () => {
    render(
      <Button asChild>
        <a href="/dashboard">ไปหน้าหลัก</a>
      </Button>,
    );
    expect(screen.getByRole("link", { name: "ไปหน้าหลัก" })).toBeDefined();
  });
});
