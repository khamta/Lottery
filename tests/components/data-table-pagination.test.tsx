import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/** mock next/navigation ก่อน import component ที่ใช้ hook เหล่านี้ */
const pushed: string[] = [];
let currentQuery = "page=2&pageSize=10&q=เก้าอี้";

mock.module("next/navigation", () => ({
  useRouter: () => ({ push: (url: string) => pushed.push(url), replace: (url: string) => pushed.push(url) }),
  usePathname: () => "/products",
  useSearchParams: () => new URLSearchParams(currentQuery),
}));

const { DataTablePagination, PageSizeSelect } = await import(
  "@/components/shared/data-table-pagination"
);

beforeEach(() => {
  pushed.length = 0;
  currentQuery = "page=2&pageSize=10&q=เก้าอี้";
});
afterEach(cleanup);

const meta = { page: 2, pageSize: 10, total: 95, pageCount: 10 };

describe("<DataTablePagination />", () => {
  test("แสดงช่วงรายการของหน้าปัจจุบัน", () => {
    render(<DataTablePagination meta={meta} />);
    expect(screen.getByText(/11–20/)).toBeDefined();
    expect(screen.getByText(/95/)).toBeDefined();
  });

  test("กดหน้าถัดไป → เปลี่ยนเฉพาะ page และคง q ไว้", () => {
    render(<DataTablePagination meta={meta} />);
    fireEvent.click(screen.getByLabelText("ໜ້າຖັດໄປ"));

    expect(pushed).toHaveLength(1);
    const qs = new URLSearchParams(pushed[0].split("?")[1]);
    expect(qs.get("page")).toBe("3");
    expect(qs.get("q")).toBe("เก้าอี้");
    expect(qs.get("pageSize")).toBe("10");
  });

  test("หน้าแรก: ปุ่มย้อนกลับถูกปิด", () => {
    render(<DataTablePagination meta={{ ...meta, page: 1 }} />);
    expect(screen.getByLabelText("ໜ້າກ່ອນ").hasAttribute("disabled")).toBe(true);
    expect(screen.getByLabelText("ໜ້າຖັດໄປ").hasAttribute("disabled")).toBe(false);
  });

  test("หน้าสุดท้าย: ปุ่มถัดไปถูกปิด", () => {
    render(<DataTablePagination meta={{ ...meta, page: 10 }} />);
    expect(screen.getByLabelText("ໜ້າຖັດໄປ").hasAttribute("disabled")).toBe(true);
  });

  test("ไม่มีข้อมูล → แสดง 0 รายการ", () => {
    render(<DataTablePagination meta={{ page: 1, pageSize: 10, total: 0, pageCount: 1 }} />);
    expect(screen.getByText(/0–0/)).toBeDefined();
  });

  test("แถบล่างไม่มีตัวเลือกจำนวนต่อหน้าแล้ว (ย้ายไปอยู่ด้านบน)", () => {
    render(<DataTablePagination meta={meta} />);
    expect(screen.queryByLabelText("ຕໍ່ໜ້າ")).toBeNull();
  });
});

describe("<PageSizeSelect />", () => {
  test("แสดงค่าปัจจุบันและป้ายกำกับ ต่อหน้า", () => {
    render(<PageSizeSelect pageSize={10} />);
    expect(screen.getByText("ຕໍ່ໜ້າ")).toBeDefined();
    expect(screen.getByLabelText("ຕໍ່ໜ້າ")).toBeDefined();
    expect(screen.getByLabelText("ຕໍ່ໜ້າ").textContent).toContain("10");
  });

  test("ปิดใช้งานได้ระหว่างรอผล", () => {
    render(<PageSizeSelect pageSize={20} disabled />);
    expect(screen.getByLabelText("ຕໍ່ໜ້າ").hasAttribute("disabled")).toBe(true);
  });
});
