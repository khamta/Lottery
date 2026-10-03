import { describe, expect, test } from "bun:test";
import ExcelJS from "exceljs";

import { buildReportTable, buildSettlementSheet, type ReportExportInput } from "@/app/(dashboard)/reports/export-tables";
import { toPercent } from "@/app/(dashboard)/reports/types";
import { dictionaries } from "@/i18n/dictionaries";
import { translateWith } from "@/i18n/translate";
import type { StakeGroup } from "@/lottery/report";
import {
  exportFileName,
  sheetToPdf,
  sheetToXlsx,
  splitRuns,
  tableToPdf,
  tableToXlsx,
  type ExportTable,
} from "@/lottery/table-export";

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
  bills: [],
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

describe("ใบสรุปส่งแม่ (layout=sheet)", () => {
  const keys = [
    { digits: 3, position: "TOP" as const, number: "243" },
    { digits: 2, position: "TOP" as const, number: "43" },
    { digits: 2, position: "BOTTOM" as const, number: "32" },
  ];
  const sheetInput = (percent: number, rates = { rate2Top: 0, rate2Bottom: 0, rate3Top: 0 }) => {
    const base = input();
    return { t: base.t, intl: base.intl, draw: base.draw, keys, exportedAt: base.exportedAt, stakes: base.stakes, rates, percent };
  };
  const sheetOptions = { ...optionsFor({ title: "sheet" } as ExportTable) };

  test("รวม → หักเปอร์เซ็นต์ที่ตั้งได้ → เหลือ → หักยอดถูก × อัตราจ่าย → ส่งแม่ · ตารางล่าง 00–99 มี 3 คอลัมน์", () => {
    const sheet = buildSettlementSheet(sheetInput(30, { rate2Top: 0, rate2Bottom: 2, rate3Top: 0 }));
    const row = (label: string) => sheet.summary.find((item) => item.label === label)!;

    expect(row("รวม")).toMatchObject({ lak: 1_050_000, thb: 200 });
    expect(row("เปอร์เซ็นต์")).toMatchObject({ lak: "30%", thb: "30%" });
    expect(row("เหลือ")).toMatchObject({ lak: 735_000, thb: 140 });
    // 2 ตัวล่าง "32" แทง 100,000 × อัตรา 2 · 3 ตัว "243" ไม่ตั้งอัตรา = ยอดแทงจริง
    expect(row("ถูก 2 ตัว")).toMatchObject({ lak: 200_000, thb: 0 });
    expect(row("ถูก 3 ตัว")).toMatchObject({ lak: 150_000, thb: 0 });
    expect(row("ส่งแม่")).toMatchObject({ lak: 385_000, thb: 140, style: "final" });

    expect(sheet.tableHeader).toEqual(["ลำดับ", "กีบ", "บาท"]);
    expect(sheet.rows).toHaveLength(100);
    expect(sheet.rows[32]).toEqual(["32", 400_000, 0]);
    expect(sheet.rows[72]).toEqual(["72", 500_000, 200]);
    expect(sheet.tableTotal).toEqual(["รวม", 900_000, 200]);

    expect(buildSettlementSheet(sheetInput(15)).summary[2]).toMatchObject({ lak: 892_500, thb: 170 });
  });

  test("เปอร์เซ็นต์จาก URL: ค่าเริ่มต้น 30 · ตัดให้อยู่ใน 0–100", () => {
    expect(toPercent(null)).toBe(30);
    expect(toPercent("abc")).toBe(30);
    expect(toPercent("25")).toBe(25);
    expect(toPercent("12.5")).toBe(12.5);
    expect(toPercent("150")).toBe(100);
    expect(toPercent("-5")).toBe(0);
  });

  test("Excel: กล่องสรุป + ตาราง 3 คอลัมน์ ค่าเป็นตัวเลขจริง", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await sheetToXlsx(buildSettlementSheet(sheetInput(30)), sheetOptions)) as unknown as ArrayBuffer);
    const ws = workbook.worksheets[0]!;
    const values = (r: number) => [1, 2, 3].map((c) => ws.getCell(r, c).value);
    const find = (label: string) => {
      for (let r = 1; r <= ws.rowCount; r++) if (ws.getCell(r, 1).value === label) return r;
      throw new Error(label);
    };

    expect(values(find("รวม"))).toEqual(["รวม", 1_050_000, 200]);
    expect(values(find("ส่งแม่"))).toEqual(["ส่งแม่", 735_000 - 100_000 - 150_000, 140]);
    expect(values(find("ลำดับ"))).toEqual(["ลำดับ", "กีบ", "บาท"]);
    expect(values(find("72"))).toEqual(["72", 500_000, 200]);
    expect(values(find("00"))).toEqual(["00", null, null]);
    expect(ws.columnCount).toBe(3);
  });

  test("PDF: สร้างได้พร้อมฟอนต์ลาว", async () => {
    const base = sheetInput(30);
    const file = await sheetToPdf(
      buildSettlementSheet({ ...base, t: (key, params) => translateWith(dictionaries.lo, key, params) }),
      sheetOptions,
    );
    const text = file.toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text).toContain("NotoSansLao");
  });
});

describe("รายงานตามบิล (view=bills)", () => {
  test("หัวกลุ่ม (ชื่อกลุ่ม + ยอดกลุ่ม) ตามด้วยบิลเรียงตามเวลา · ไม่รู้กลุ่ม/คีย์เอง ใช้ข้อความแปล", () => {
    const bill = (billNo: string, lak: number, status: "CONFIRMED" | "REVIEW" = "CONFIRMED") => ({
      id: billNo,
      billNo,
      createdAt: new Date("2026-10-03T07:30:15Z"),
      status,
      name: "ສົມ",
      betCount: 2,
      lak,
      thb: 0,
    });
    const table = buildReportTable(
      input({
        view: "bills",
        bills: [
          { key: "g1", kind: "group", name: "ກຸ່ມ A", bills: [bill("BNO261003143015", 300), bill("BNO261003143016", 0, "REVIEW")], total: { lak: 300, thb: 0 } },
          { key: "manual", kind: "manual", name: null, bills: [bill("BNO261003150000", 100)], total: { lak: 100, thb: 0 } },
        ],
      }),
    );

    expect(table.rows.map((row) => (row[0] as { value: string }).value ?? row[0])).toEqual([
      "ກຸ່ມ A · 2 บิล",
      "BNO261003143015",
      "BNO261003143016",
      "คีย์เอง · 1 บิล",
      "BNO261003150000",
    ]);
    expect(table.rows[0]![4]).toEqual({ value: 300, bold: true });
    expect(table.rows[2]![6]).toEqual({ value: "รอตรวจ", tone: "danger" });
    expect(table.totals).toEqual(["รวม", null, "3 บิล", 6, 400, 0, null]);
  });
});
