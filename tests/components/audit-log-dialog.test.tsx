import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";

import {
  AuditLogDialog,
  toChangeRows,
} from "@/app/(dashboard)/audit-logs/_components/audit-log-dialog";
import type { AuditLogRow } from "@/app/(dashboard)/audit-logs/types";
import { defaultLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";

const dict = dictionaries[defaultLocale].auditLogs;

afterEach(cleanup);

function makeLog(overrides: Partial<AuditLogRow>): AuditLogRow {
  return {
    id: "log-1",
    action: "UPDATE",
    entity: "Product",
    entityId: "p1",
    summary: "SKU-001 · Coffee",
    changes: null,
    actor: { name: "Kim Lee", email: "kim@example.com", image: null },
    userName: "Kim Lee",
    ip: "203.0.113.7",
    userAgent: "Mozilla/5.0 (TestAgent)",
    createdAt: "2026-09-24T03:00:00.000Z",
    ...overrides,
  };
}

/** คืนเซลล์ [field, before, arrow, after] ของแถวที่ขึ้นต้นด้วยชื่อ field */
function cellsOf(field: string) {
  const row = screen.getByRole("cell", { name: field }).closest("tr");
  if (!row) throw new Error(`row ${field} not found`);
  return Array.from(row.querySelectorAll("td"), (cell) => cell.textContent);
}

describe("toChangeRows()", () => {
  test("แยก 'ไม่มีค่า' ออกจาก 'ค่า null' ทั้ง 3 รูปแบบ", () => {
    expect(toChangeRows({ name: { to: "Coffee" } })).toEqual([
      { field: "name", from: null, to: "Coffee", hasFrom: false, hasTo: true },
    ]);
    expect(toChangeRows({ price: { from: 10, to: null } })).toEqual([
      { field: "price", from: 10, to: null, hasFrom: true, hasTo: true },
    ]);
    expect(toChangeRows({ stock: { from: 3 } })).toEqual([
      { field: "stock", from: 3, to: null, hasFrom: true, hasTo: false },
    ]);
  });

  test("changes ว่าง/ผิดรูป → ไม่มีแถว หรือถือเป็นค่า 'หลัง'", () => {
    expect(toChangeRows(null)).toEqual([]);
    expect(toChangeRows("oops")).toEqual([]);
    expect(toChangeRows({ legacy: 5 })).toEqual([
      { field: "legacy", from: null, to: 5, hasFrom: false, hasTo: true },
    ]);
  });
});

describe("<AuditLogDialog />", () => {
  test("log เป็น null → ไม่เปิดหน้าต่าง", () => {
    render(<AuditLogDialog log={null} onOpenChange={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("CREATE: ช่อง 'ก่อน' เป็นขีด ช่อง 'หลัง' แสดงค่า (รวม boolean/number)", () => {
    render(
      <AuditLogDialog
        log={makeLog({
          action: "CREATE",
          changes: { name: { to: "Coffee" }, price: { to: 45.5 }, active: { to: true } },
        })}
        onOpenChange={() => {}}
      />,
    );

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(dict.actionCREATE)).toBeTruthy();
    expect(cellsOf("name")).toEqual(["name", "—", "", "Coffee"]);
    expect(cellsOf("price")).toEqual(["price", "—", "", "45.5"]);
    expect(cellsOf("active")).toEqual(["active", "—", "", "true"]);
  });

  test("UPDATE: แสดงก่อน → หลัง, null เป็นคำว่า 'ว่าง' และ [redacted] แสดงตามจริง + ip/userAgent", () => {
    render(
      <AuditLogDialog
        log={makeLog({
          action: "UPDATE",
          changes: {
            price: { from: 10, to: 12 },
            description: { from: null, to: "Arabica" },
            password: { from: "[redacted]", to: "[redacted]" },
          },
        })}
        onOpenChange={() => {}}
      />,
    );

    expect(cellsOf("price")).toEqual(["price", "10", "", "12"]);
    expect(cellsOf("description")).toEqual(["description", dict.emptyValue, "", "Arabica"]);
    expect(cellsOf("password")).toEqual(["password", "[redacted]", "", "[redacted]"]);
    expect(screen.getByText("203.0.113.7")).toBeTruthy();
    expect(screen.getByText("Mozilla/5.0 (TestAgent)")).toBeTruthy();
  });

  test("DELETE: ช่อง 'หลัง' เป็นขีด + ผู้ใช้ถูกลบแล้วใช้ชื่อที่บันทึกไว้", () => {
    render(
      <AuditLogDialog
        log={makeLog({
          action: "DELETE",
          actor: null,
          userName: "old@example.com",
          ip: null,
          changes: { sku: { from: "SKU-001" }, stock: { from: 0 } },
        })}
        onOpenChange={() => {}}
      />,
    );

    expect(screen.getByText(dict.actionDELETE)).toBeTruthy();
    expect(cellsOf("sku")).toEqual(["sku", "SKU-001", "", "—"]);
    expect(cellsOf("stock")).toEqual(["stock", "0", "", "—"]);
    expect(screen.getByText("old@example.com")).toBeTruthy();
    expect(screen.getByText(dict.unknown)).toBeTruthy(); // ip ไม่มี
  });

  test("ไม่มีรายละเอียดการเปลี่ยนแปลง → ข้อความว่าง", () => {
    render(<AuditLogDialog log={makeLog({ changes: null })} onOpenChange={() => {}} />);
    expect(screen.getByText(dict.noChanges)).toBeTruthy();
  });
});
