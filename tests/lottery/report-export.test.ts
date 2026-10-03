import { describe, expect, test } from "bun:test";
import ExcelJS from "exceljs";

import {
  buildReportTable,
  buildSettlementSheet,
  type ReportExportInput,
  type SettlementExportInput,
} from "@/app/(dashboard)/reports/export-tables";
import { toAmount, toPercent } from "@/app/(dashboard)/reports/types";
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
  type SheetLine,
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
  const noRates = { rate2Top: 0, rate2Bottom: 0, rate3Top: 0 };
  // ตัวเลขจากใบจริงของแม่หวย: LAO รับ 447,070 กีบ / 302,656 บาท · ถูก 2 ตัว 304,780 / 177,800 · ถูก 3 ตัว 3,500
  const lao = {
    name: "ງວດ 03/10/2026",
    lottery: "LAO" as const,
    keys,
    rates: noRates,
    stakes: [
      stake("43", "TOP", "LAK", 304_780),
      stake("43", "TOP", "THB", 177_800),
      stake("243", "TOP", "LAK", 3_500),
      stake("12", "BOTTOM", "LAK", 138_790),
      stake("12", "BOTTOM", "THB", 124_856),
    ],
  };
  const sheetInput = (overrides: Partial<SettlementExportInput> = {}): SettlementExportInput => ({
    t: (key, params) => translateWith(dictionaries.lo, key, params),
    intl: "lo-LA",
    date: "2026-10-03",
    draws: [lao],
    exportedAt: new Date("2026-10-03T12:00:00Z"),
    percents: { left: 15, right: 30 },
    outstanding: { lak: 0, thb: 0 },
    ...overrides,
  });
  const line = (lines: SheetLine[], label: string) => lines.find((item) => item.label === label)!;
  const sheetOptions = optionsFor({ title: "sheet" } as ExportTable);

  test("ได้ตัวเลขเดียวกับใบจริง: ขวา 447,070 × 30% → 312,949 · หักยอดถูก → เหลือ / ส่งแม่ 4,669 กีบ 34,059 บาท", () => {
    const sheet = buildSettlementSheet(sheetInput());

    expect(sheet.left.map((item) => item.label)).toEqual(["V3", "V4", "V8", "V9", "ລວມ", "ເປີເຊັນ", "ເຫຼືອ"]);
    expect(sheet.right.map((item) => item.label)).toEqual(["V5", "V6", "V7", "LAO", "THAI", "ລວມ", "ເປີເຊັນ", "ເຫຼືອ"]);
    expect(line(sheet.right, "LAO")).toMatchObject({ lak: 447_070, thb: 302_656 });
    expect(line(sheet.right, "ເປີເຊັນ")).toMatchObject({ lak: "30%", thb: "30%" });
    expect(line(sheet.right, "ເຫຼືອ")).toMatchObject({ lak: 312_949, thb: 211_859 });
    expect(line(sheet.left, "ເປີເຊັນ")).toMatchObject({ lak: "15%" });
    expect(line(sheet.left, "ເຫຼືອ")).toMatchObject({ lak: 0, thb: 0 });

    expect(sheet.result.map((item) => [item.label, item.lak, item.thb])).toEqual([
      ["ຖືກ 2ໂຕ", 304_780, 177_800],
      ["ຖືກ 3ໂຕ", 3_500, 0],
      ["ເຫຼືອ", 4_669, 34_059],
      ["ຄ້າງ", 0, 0],
      ["ສົ່ງແມ່", 4_669, 34_059],
    ]);
  });

  test("หลายงวดในวันเดียว: หวยเวียดนามลงกล่องซ้ายตามรอบ · เปอร์เซ็นต์แยกกล่อง · ค้างบวกเข้ายอดส่งแม่", () => {
    const v3 = { name: "V3 ງວດ 03/10/2026", lottery: "V3" as const, keys: null, rates: noRates, stakes: [stake("12", "TOP", "LAK", 100_000)] };
    const v8 = { name: "V8 ງວດ 03/10/2026", lottery: "V8" as const, keys: null, rates: noRates, stakes: [stake("12", "TOP", "LAK", 20_000)] };
    const sheet = buildSettlementSheet(
      sheetInput({ draws: [lao, v3, v8], percents: { left: 10, right: 30 }, outstanding: { lak: 1_000, thb: -59 } }),
    );

    expect(line(sheet.left, "V3")).toMatchObject({ lak: 100_000 });
    expect(line(sheet.left, "V8")).toMatchObject({ lak: 20_000 });
    expect(line(sheet.left, "ລວມ")).toMatchObject({ lak: 120_000 });
    expect(line(sheet.left, "ເຫຼືອ")).toMatchObject({ lak: 108_000 });
    // เหลือ = 108,000 + 312,949 − 304,780 − 3,500 · ส่งแม่ = เหลือ + ค้าง
    expect(sheet.result[2]).toMatchObject({ lak: 112_669, thb: 34_059 });
    expect(sheet.result[4]).toMatchObject({ lak: 113_669, thb: 34_000 });
    expect(sheet.meta[0]).toContain("V3 ງວດ 03/10/2026");
    // ตารางล่างรวมเลข 2 ตัวของทุกงวดในวัน
    expect(sheet.rows[12]).toEqual(["12", 258_790, 124_856]);
    expect(sheet.tableHeader).toEqual(["ລ/ດ", "ກີບ", "ບາດ"]);
  });

  test("อัตราจ่ายของงวด (ถ้าตั้งไว้) คูณยอดถูก", () => {
    const sheet = buildSettlementSheet(sheetInput({ draws: [{ ...lao, rates: { rate2Top: 2, rate2Bottom: 0, rate3Top: 0 } }] }));
    expect(sheet.result[0]).toMatchObject({ lak: 609_560, thb: 355_600 });
  });

  test("ค่าจาก URL: เปอร์เซ็นต์ตัดให้อยู่ใน 0–100 (อ่านไม่ได้ = ค่าเริ่มต้น) · ยอดค้างอ่านไม่ได้ = 0", () => {
    expect(toPercent(null, 15)).toBe(15);
    expect(toPercent("abc", 30)).toBe(30);
    expect(toPercent("12.5", 30)).toBe(12.5);
    expect(toPercent("150", 30)).toBe(100);
    expect(toPercent("-5", 30)).toBe(0);
    expect(toAmount("1,500")).toBe(1500);
    expect(toAmount("-20")).toBe(-20);
    expect(toAmount(null)).toBe(0);
  });

  test("Excel: สองกล่องข้างกัน + ส่วนผลใต้กล่องซ้าย + ตาราง 3 คอลัมน์ · ลาว = Phetsarath OT · ตัวเลข = Times New Roman", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await sheetToXlsx(buildSettlementSheet(sheetInput()), sheetOptions)) as unknown as ArrayBuffer);
    const ws = workbook.worksheets[0]!;
    const find = (col: number, label: string) => {
      for (let r = 1; r <= ws.rowCount; r++) if (ws.getCell(r, col).value === label) return r;
      throw new Error(label);
    };

    const lao = find(5, "LAO");
    expect([ws.getCell(lao, 6).value, ws.getCell(lao, 7).value]).toEqual([447_070, 302_656]);
    const send = find(1, "ສົ່ງແມ່");
    expect([ws.getCell(send, 2).value, ws.getCell(send, 3).value]).toEqual([4_669, 34_059]);
    expect(ws.getCell(send, 2).font.underline).toBe("double");
    expect(ws.getCell(find(1, "V3"), 2).numFmt).toContain('"-"'); // ศูนย์แสดง -

    expect(ws.getCell(send, 1).font.name).toBe("Phetsarath OT");
    expect(ws.getCell(send, 2).font.name).toBe("Times New Roman");
    expect(ws.getCell(find(5, "LAO"), 5).font.name).toBe("Times New Roman");
    expect(ws.getCell(find(1, "72"), 2).value).toBeNull();
    // ช่องที่มีทั้งตัวลาวและตัวเลข → rich text แยกฟอนต์ตามช่วง
    const title = ws.getCell(1, 1).value as { richText: { text: string; font: { name: string } }[] };
    expect(title.richText.find((run) => run.text.includes("2026"))!.font.name).toBe("Times New Roman");
    expect(title.richText.find((run) => run.text.includes("ໃບ"))!.font.name).toBe("Phetsarath OT");
  });

  test("PDF: สร้างได้พร้อมฟอนต์ลาว", async () => {
    const file = await sheetToPdf(buildSettlementSheet(sheetInput()), sheetOptions);
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
