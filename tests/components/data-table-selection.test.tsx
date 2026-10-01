import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";

mock.module("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => "/products",
  useSearchParams: () => new URLSearchParams("page=1&pageSize=10"),
}));

const { DataTable } = await import("@/components/shared/data-table");
const { defaultLocale } = await import("@/i18n/config");
const { dictionaries } = await import("@/i18n/dictionaries");

const table = dictionaries[defaultLocale].table;

afterEach(cleanup);

type Row = { id: string; name: string; __optimistic?: string };

const columns: ColumnDef<Row>[] = [{ id: "name", accessorKey: "name", header: "Name" }];
const meta = { page: 1, pageSize: 10, total: 3, pageCount: 1 };
const rows: Row[] = [
  { id: "1", name: "A" },
  { id: "2", name: "B" },
  { id: "3", name: "C" },
];

function setup(data: Row[] = rows) {
  const calls: Row[][] = [];
  const utils = render(
    <DataTable
      columns={columns}
      page={{ ...meta, rows: data }}
      selectable
      bulkActions={({ rows: selected, clear }) => (
        <>
          <button type="button" onClick={() => calls.push(selected)}>
            bulk
          </button>
          <button type="button" onClick={clear}>
            reset
          </button>
        </>
      )}
    />,
  );
  return { ...utils, calls };
}

const rowBoxes = () => screen.getAllByLabelText(table.selectRow) as HTMLInputElement[];
const allBox = () => screen.getByLabelText(table.selectAll) as HTMLInputElement;

describe("<DataTable selectable />", () => {
  test("ไม่มีแถบจัดการจนกว่าจะเลือก", () => {
    setup();
    expect(rowBoxes()).toHaveLength(3);
    expect(screen.queryByText("bulk")).toBeNull();
  });

  test("เลือกทีละแถว → แถบโผล่ และ bulkActions ได้แถวที่เลือกจริง", () => {
    const { calls } = setup();
    fireEvent.click(rowBoxes()[0]);
    fireEvent.click(rowBoxes()[2]);

    expect(allBox().indeterminate).toBe(true);
    fireEvent.click(screen.getByText("bulk"));
    expect(calls[0].map((row) => row.id)).toEqual(["1", "3"]);
  });

  test("เลือกทั้งหมด / ล้างการเลือก", () => {
    const { calls } = setup();
    fireEvent.click(allBox());
    expect(rowBoxes().every((box) => box.checked)).toBe(true);

    fireEvent.click(screen.getByText("bulk"));
    expect(calls[0]).toHaveLength(3);

    fireEvent.click(screen.getByText("reset"));
    expect(rowBoxes().some((box) => box.checked)).toBe(false);
    expect(screen.queryByText("bulk")).toBeNull();
  });

  test("แถวที่ยังรอบันทึก (optimistic) เลือกไม่ได้", () => {
    setup([{ id: "tmp", name: "ใหม่", __optimistic: "create" }, ...rows]);
    expect(rowBoxes()[0].disabled).toBe(true);
  });

  test("แถวที่หายไปจากหน้า (ถูกลบ/เปลี่ยนหน้า) หลุดจากการเลือก", () => {
    const { rerender } = setup();
    fireEvent.click(rowBoxes()[0]);

    rerender(
      <DataTable
        columns={columns}
        page={{ ...meta, rows: rows.slice(1) }}
        selectable
        bulkActions={() => <button type="button">bulk</button>}
      />,
    );
    expect(screen.queryByText("bulk")).toBeNull();
  });
});
