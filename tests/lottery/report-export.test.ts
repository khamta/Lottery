import { describe, expect, test } from "bun:test";
import ExcelJS from "exceljs";

import { buildReportTable, type ReportExportInput } from "@/app/(dashboard)/reports/export-tables";
import { dictionaries } from "@/i18n/dictionaries";
import { translateWith } from "@/i18n/translate";
import type { StakeGroup } from "@/lottery/report";
import { exportFileName, splitRuns, tableToPdf, tableToXlsx, type ExportTable } from "@/lottery/table-export";

/**
 * ส่งออกรายงาน — ตารางของแต่ละมุมมอง (reports/export-tables.ts) + ไฟล์ Excel / PDF (lottery/table-export.ts)
 * อ่านไฟล์ Excel กลับด้วย exceljs เพื่อเช็คค่าจริงในแต่ละช่อง · PDF เช็คว่าสร้างได้ครบทุกหน้าพร้อมฟอนต์ไทย/ลาว
 */
const stake = (number: string, position: "TOP" | "BOTTOM", currency: "LAK" | "THB", amount: number): StakeGroup => ({
  number,
  digits: number.length,
  position,
  currency,
  amount,
});

const input = (overrides: Partial<ReportExportInput> = {}): ReportExportInput => ({
  t: (key, params) => translateWith(dictionaries.th, key, params),
  intl: "th-TH",
  view: "two",
  top: 40,
  draw: { name: "งวด 01/10", status: "OPEN" },
  keys: null,
  exportedAt: new Date("2026-10-02T05:00:00Z"),
  stakes: [
    stake("32", "TOP", "LAK", 300_000),
    stake("32", "BOTTOM", "LAK", 100_000),
    stake("72", "TOP", "LAK", 500_000),
    stake("72", "TOP", "THB", 200),
    stake("243", "TOP", "LAK", 150_000),
  ],
  limits: [],
  customers: [],
  winners: [],
  ...overrides,
});

const optionsFor = (table: ExportTable) => ({
  intl: "th-TH",
  sheetName: table.title,
  exportedAt: new Date("2026-10-02T05:00:00Z"),
  pageLabel: (page: number, pages: number) => `${page}/${pages}`,
});

async function readSheet(table: ExportTable) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await tableToXlsx(table, optionsFor(table))) as unknown as ArrayBuffer);
  return workbook.worksheets[0]!;
}

describe("buildReportTable", () => {
  test("เลข 2 ตัว: เรียงตามยอดกีบ · เลขที่ออกมีป้าย · เกินอั้นเป็นสีแดง · แถวรวมนับทุกเลข แม้ตัดตาม Top", () => {
    const table = buildReportTable(
      input({
        top: 40,
        keys: [
          { digits: 3, position: "TOP", number: "243" },
          { digits: 2, position: "TOP", number: "43" },
          { digits: 2, position: "BOTTOM", number: "32" },
        ],
        limits: [{ digits: 2, number: "72", position: "TOP", currency: "LAK", maxAmount: 400_000 }],
      }),
    );

    expect(table.title).toBe("รายงานสรุป — เลข 2 ตัว");
    expect(table.meta[0]).toBe("งวด 01/10 · เปิดรับ · ผล: 3 ตัวบน 243 · 2 ตัวบน 43 · 2 ตัวล่าง 32");
    expect(table.rows.map((row) => row[0])).toEqual([1, 2]);
    expect(table.rows[0]![1]).toEqual({ value: "72", bold: true });
    expect(table.rows[0]![2]).toEqual({ value: 500_000, tone: "danger", bold: true });
    expect(table.rows[1]![1]).toEqual({ value: "32 · ออกล่าง", tone: "success", bold: true });
    expect(table.totals).toEqual([null, "รวมทุกเลข", 800_000, 100_000, 200, 0]);

    const top1 = buildReportTable(input({ top: 0 }));
    expect(top1.meta[1]).toContain("ทั้งหมด");
  });

  test("เลข 3 ตัวบนแยกจากเลข 2 ตัว", () => {
    const table = buildReportTable(input({ view: "three" }));
    expect(table.rows).toEqual([[1, { value: "243", bold: true }, 150_000, 0]]);
  });

  test("ตามลูกค้า: ไม่มีชื่อ = ไม่ระบุลูกค้า (สีจาง) · คอลัมน์ยอดถูกมีเฉพาะงวดที่กรอกผลแล้ว", () => {
    const customers = [
      { customerId: "c1", name: "ທ້າວ ສົມໃຈ", tickets: 3, stake: { lak: 900_000, thb: 0 }, won: { lak: 0, thb: 0 } },
      { customerId: null, name: null, tickets: 1, stake: { lak: 100_000, thb: 50 }, won: { lak: 0, thb: 0 } },
    ];
    const open = buildReportTable(input({ view: "customers", customers }));
    expect(open.columns).toHaveLength(4);
    expect(open.rows[1]![0]).toEqual({ value: "ไม่ระบุลูกค้า", tone: "muted" });
    expect(open.totals).toEqual(["รวม", 4, 1_000_000, 50]);

    const settled = buildReportTable(
      input({ view: "customers", customers, keys: [{ digits: 3, position: "TOP", number: "243" }, { digits: 2, position: "TOP", number: "43" }, { digits: 2, position: "BOTTOM", number: "32" }] }),
    );
    expect(settled.columns).toHaveLength(6);
  });

  test("ถูกรางวัล: ยังไม่กรอกผล → ตารางว่างพร้อมข้อความบอก", () => {
    const table = buildReportTable(input({ view: "winners" }));
    expect(table.rows).toEqual([]);
    expect(table.empty).toBe("ยังไม่ได้กรอกผล");
  });

  test("เกินอั้น: ส่วนเกินเป็นสีแดง", () => {
    const table = buildReportTable(
      input({ view: "limits", limits: [{ digits: 2, number: "72", position: "TOP", currency: "LAK", maxAmount: 400_000 }] }),
    );
    expect(table.rows).toEqual([
      [{ value: "72", bold: true }, "2 ตัว บน", "กีบ", 500_000, { value: 400_000, tone: "muted" }, { value: 100_000, tone: "danger", bold: true }],
    ]);
  });
});

describe("tableToXlsx", () => {
  test("หัวข้อ + หัวตาราง + แถว + แถวรวม — ตัวเลขเป็นตัวเลขจริง เลขหวยเป็นข้อความ (เลข 0 นำหน้าไม่หาย)", async () => {
    const table = buildReportTable(input({ stakes: [stake("05", "TOP", "LAK", 300_000)] }));
    const sheet = await readSheet(table);

    expect(sheet.getCell("A1").value).toBe("รายงานสรุป — เลข 2 ตัว");
    const header = table.meta.length + 3;
    expect(sheet.getRow(header).getCell(2).value).toBe("เลข");
    expect(sheet.getRow(header + 1).getCell(2).value).toBe("05");
    expect(sheet.getRow(header + 1).getCell(3).value).toBe(300_000);
    expect(sheet.getRow(header + 2).getCell(2).value).toBe("รวมทุกเลข");
  });

  test("ไม่มีข้อมูล → บอกข้อความว่าง", async () => {
    const table = buildReportTable(input({ view: "limits" }));
    const sheet = await readSheet(table);
    expect(sheet.getRow(table.meta.length + 4).getCell(1).value).toBe("ไม่มีเลขเกินอั้น");
  });
});

describe("tableToPdf", () => {
  test("แบ่งช่วงฟอนต์: ตัวลาวใช้ฟอนต์ลาว · ตัวเลขใช้ Sarabun เสมอ (ฟอนต์ลาวไม่มีตัวเลข) · ช่องว่างต่อท้ายช่วงเดิม", () => {
    expect(splitRuns("บิล 12 ງວດ 01/10")).toEqual([
      { lao: false, text: "บิล 12 " },
      { lao: true, text: "ງວດ " },
      { lao: false, text: "01/10" },
    ]);
  });

  test("สร้าง PDF ได้ — ตารางยาวขึ้นหน้าใหม่เอง พร้อมฝังฟอนต์ไทยและลาว", async () => {
    const stakes = Array.from({ length: 100 }, (_, i) => stake(String(i).padStart(2, "0"), "TOP", "LAK", (i + 1) * 1000));
    const table = buildReportTable(input({ top: 0, stakes, draw: { name: "ງວດ 01/10/2026", status: "OPEN" } }));
    const file = await tableToPdf(table, optionsFor(table));

    const text = file.toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("Sarabun");
    expect(text).toContain("NotoSansLao");
    expect((text.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
  });
});

test("ชื่อไฟล์: ตัดอักขระที่ใช้ในชื่อไฟล์ไม่ได้", () => {
  expect(exportFileName(["report", "งวด 01/10", "2-digit"], new Date("2026-10-02T05:00:00Z"), "xlsx")).toBe(
    "report-งวด-01-10-2-digit-2026-10-02.xlsx",
  );
});
