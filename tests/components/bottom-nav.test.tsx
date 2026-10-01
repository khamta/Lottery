import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";

let currentPath = "/products";

mock.module("next/navigation", () => ({
  usePathname: () => currentPath,
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

const { BottomNav } = await import("@/components/layout/bottom-nav");

afterEach(cleanup);

describe("<BottomNav /> (เมนูล่างจอสำหรับมือถือ)", () => {
  test("ADMIN มี 5 เมนู → แสดง 3 แท็บแรก + ปุ่มเพิ่มเติม (ตั้งค่า / ประวัติการใช้งาน อยู่ใน sheet)", () => {
    render(<BottomNav role="ADMIN" />);

    expect(screen.getByText("ແຜງຄວບຄຸມ")).toBeDefined();
    expect(screen.getByText("ສິນຄ້າ")).toBeDefined();
    expect(screen.getByText("ຜູ້ໃຊ້ງານ")).toBeDefined();
    expect(screen.getByText("ເພີ່ມເຕີມ")).toBeDefined();
    expect(screen.queryByText("ຕັ້ງຄ່າ")).toBeNull();
    expect(screen.queryByText("ປະຫວັດການນຳໃຊ້")).toBeNull();
    expect(document.querySelectorAll("nav li")).toHaveLength(4);
  });

  test("USER มี 3 เมนู → แสดงครบเป็นแท็บ ไม่มีปุ่มเพิ่มเติม และไม่เห็นประวัติการใช้งาน", () => {
    render(<BottomNav role="USER" />);

    expect(screen.getByText("ຕັ້ງຄ່າ")).toBeDefined();
    expect(screen.queryByText("ເພີ່ມເຕີມ")).toBeNull();
    expect(screen.queryByText("ປະຫວັດການນຳໃຊ້")).toBeNull();
    expect(document.querySelectorAll("nav li")).toHaveLength(3);
  });

  test("แท็บไม่เกิน 4 ช่องเสมอ — เมนูที่เกินจะไปอยู่ปุ่มเพิ่มเติม", () => {
    // กติกา: items <= 4 แสดงหมด, items > 4 แสดง 3 อัน + ปุ่มเพิ่มเติม
    render(<BottomNav role="ADMIN" />);
    expect(document.querySelectorAll("nav li").length).toBeLessThanOrEqual(4);
  });

  test("USER ไม่เห็นเมนูที่จำกัดสิทธิ์ ADMIN", () => {
    render(<BottomNav role="USER" />);
    expect(screen.queryByText("ຜູ້ໃຊ້ງານ")).toBeNull();
  });

  test("แท็บของหน้าปัจจุบันถูกทำเครื่องหมาย aria-current", () => {
    currentPath = "/products";
    render(<BottomNav role="USER" />);

    const active = screen.getByText("ສິນຄ້າ").closest("a");
    expect(active?.getAttribute("aria-current")).toBe("page");
  });

  test("แท็บอื่นไม่ถูกทำเครื่องหมาย", () => {
    currentPath = "/products";
    render(<BottomNav role="USER" />);

    const other = screen.getByText("ແຜງຄວບຄຸມ").closest("a");
    expect(other?.getAttribute("aria-current")).toBeNull();
  });

  test("ซ่อนบนจอใหญ่ (lg:hidden)", () => {
    render(<BottomNav role="USER" />);
    expect(document.querySelector("nav")?.className).toContain("lg:hidden");
  });
});
