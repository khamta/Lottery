import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";

import { navGroups } from "@/config/nav";

let currentPath = "/dashboard";

mock.module("next/navigation", () => ({
  usePathname: () => currentPath,
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

const { BottomNav } = await import("@/components/layout/bottom-nav");

afterEach(cleanup);

// อ่านเมนูจริงจาก config/nav.ts — เทสต์ตรวจ "กติกา" ของแถบล่าง ไม่ผูกกับเมนูของ project ใด project หนึ่ง
const itemsFor = (role: "ADMIN" | "USER") =>
  navGroups.flatMap((group) => group.items).filter((item) => !item.roles || item.roles.includes(role));

const tabHrefs = () =>
  Array.from(document.querySelectorAll("nav li a")).map((a) => a.getAttribute("href"));

describe("<BottomNav /> (เมนูล่างจอสำหรับมือถือ)", () => {
  for (const role of ["ADMIN", "USER"] as const) {
    test(`${role}: เมนูไม่เกิน 4 แสดงครบเป็นแท็บ · เกิน 4 แสดง 3 อันแรก + ปุ่มเพิ่มเติม`, () => {
      const items = itemsFor(role);
      render(<BottomNav role={role} />);

      const hasMore = items.length > 4;
      const expected = (hasMore ? items.slice(0, 3) : items).map((item) => item.href);

      expect(tabHrefs()).toEqual(expected);
      expect(document.querySelectorAll("nav li")).toHaveLength(expected.length + (hasMore ? 1 : 0));
      expect(screen.queryByText("ເພີ່ມເຕີມ") !== null).toBe(hasMore);
    });
  }

  test("แท็บไม่เกิน 4 ช่องเสมอ — เมนูที่เกินจะไปอยู่ปุ่มเพิ่มเติม", () => {
    render(<BottomNav role="ADMIN" />);
    expect(document.querySelectorAll("nav li").length).toBeLessThanOrEqual(4);
  });

  test("USER ไม่เห็นเมนูที่จำกัดสิทธิ์ ADMIN", () => {
    render(<BottomNav role="USER" />);

    const adminOnly = navGroups
      .flatMap((group) => group.items)
      .filter((item) => item.roles && !item.roles.includes("USER"))
      .map((item) => item.href);

    expect(tabHrefs().filter((href) => adminOnly.includes(href as never))).toEqual([]);
  });

  test("แท็บของหน้าปัจจุบันถูกทำเครื่องหมาย aria-current", () => {
    const [first] = itemsFor("USER");
    currentPath = first!.href;
    render(<BottomNav role="USER" />);

    const active = document.querySelector(`nav a[href="${first!.href}"]`);
    expect(active?.getAttribute("aria-current")).toBe("page");
  });

  test("หน้าย่อยของเมนูก็นับว่าอยู่ในแท็บนั้น", () => {
    const [first] = itemsFor("USER");
    currentPath = `${first!.href}/123`;
    render(<BottomNav role="USER" />);

    const active = document.querySelector(`nav a[href="${first!.href}"]`);
    expect(active?.getAttribute("aria-current")).toBe("page");
  });

  test("แท็บอื่นไม่ถูกทำเครื่องหมาย", () => {
    const [first, second] = itemsFor("USER");
    currentPath = first!.href;
    render(<BottomNav role="USER" />);

    const other = document.querySelector(`nav a[href="${second!.href}"]`);
    expect(other?.getAttribute("aria-current")).toBeNull();
  });

  test("ซ่อนบนจอใหญ่ (lg:hidden)", () => {
    render(<BottomNav role="USER" />);
    expect(document.querySelector("nav")?.className).toContain("lg:hidden");
  });
});
