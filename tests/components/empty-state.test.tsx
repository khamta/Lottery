import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";

afterEach(cleanup);

describe("<EmptyState />", () => {
  test("แสดงหัวข้อและคำอธิบาย", () => {
    render(<EmptyState title="ยังไม่มีสินค้า" description="กดปุ่มเพิ่มสินค้า" />);
    expect(screen.getByText("ยังไม่มีสินค้า")).toBeDefined();
    expect(screen.getByText("กดปุ่มเพิ่มสินค้า")).toBeDefined();
  });
});

describe("<PageHeader />", () => {
  test("หัวข้อเป็น heading ระดับ 1 และแสดง action", () => {
    render(<PageHeader title="สินค้า" action={<button type="button">เพิ่ม</button>} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("สินค้า");
    expect(screen.getByRole("button", { name: "เพิ่ม" })).toBeDefined();
  });
});
