import { join } from "node:path";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

import { formatNumber } from "@/lottery/format";

/**
 * ส่งออกตารางเป็น Excel / PDF — หน้ารายงานส่งตารางของมุมมองที่เปิดอยู่มา (reports/export-tables.ts)
 * ไฟล์นี้ไม่แตะฐานข้อมูลและไม่แปลภาษาเอง: รับหัวข้อ/หัวคอลัมน์ที่แปลแล้ว + ค่าในแต่ละช่อง แล้วคืนไฟล์เป็น Buffer
 */

/** สีของช่อง — danger = เกินอั้น · success = เลขที่ออก · muted = ไม่มีลูกค้า/ยอดเป็น 0 */
export type Tone = "danger" | "success" | "muted";
export type ExportValue = string | number | null;
export type ExportCell = ExportValue | { value: ExportValue; tone?: Tone; bold?: boolean };

export type ExportColumn = {
  header: string;
  /** สัดส่วนความกว้าง (PDF แบ่งตามสัดส่วน · Excel = จำนวนตัวอักษรโดยประมาณ ×2) */
  weight: number;
  align?: "left" | "right";
  /** ตัวเลขที่เป็น 0 แสดงสีจาง (เหมือนตารางบนหน้าเว็บ) */
  dimZero?: boolean;
};

export type ExportTable = {
  title: string;
  /** บรรทัดใต้หัวข้อ: งวด · ผล · เวลาส่งออก ฯลฯ */
  meta: string[];
  columns: ExportColumn[];
  rows: ExportCell[][];
  totals?: ExportCell[];
  /** ข้อความเมื่อไม่มีแถว */
  empty: string;
  /** หมายเหตุท้ายตาราง เช่น แสดงเฉพาะ N รายการแรก */
  footnote?: string;
};

export type ExportOptions = {
  intl: string;
  sheetName: string;
  exportedAt: Date;
  /** ป้ายเลขหน้าท้ายกระดาษ PDF */
  pageLabel: (page: number, pages: number) => string;
};

type Resolved = { value: ExportValue; tone?: Tone; bold?: boolean };

function resolve(cell: ExportCell | undefined, column: ExportColumn, bold?: boolean): Resolved {
  const resolved: Resolved = cell !== null && typeof cell === "object" ? cell : { value: cell ?? null };
  const tone = resolved.tone ?? (column.dimZero && resolved.value === 0 ? "muted" : undefined);
  return { ...resolved, tone, bold: resolved.bold ?? bold };
}

const display = (value: ExportValue, intl: string) =>
  value === null ? "" : typeof value === "number" ? formatNumber(value, intl) : value;

/** ชื่อไฟล์: report-<ส่วนต่าง ๆ>-<วันที่>.xlsx — ตัดอักขระที่ใช้ในชื่อไฟล์ไม่ได้ */
export function exportFileName(parts: string[], exportedAt: Date, ext: "xlsx" | "pdf") {
  const safe = parts.map((part) => part.replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "")).filter(Boolean);
  return `${[...safe, exportedAt.toISOString().slice(0, 10)].join("-")}.${ext}`;
}

// ───────────────────────────────── Excel ─────────────────────────────────

const ARGB: Record<Tone, string> = { danger: "FFDC2626", success: "FF16A34A", muted: "FF6B7280" };
/** ตัวเลขเป็นตัวเลขจริงใน Excel (รวม/กรองต่อได้) — ทศนิยมแสดงเฉพาะค่าที่มีเศษ */
const numberFormat = (value: number) => (Number.isInteger(value) ? "#,##0" : "#,##0.00");

export async function tableToXlsx(table: ExportTable, options: ExportOptions): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = options.exportedAt;
  const headerRow = table.meta.length + 3; // หัวข้อ + meta + บรรทัดว่าง
  // ชื่อชีตยาวได้ไม่เกิน 31 ตัวอักษรและห้ามมี : \ / ? * [ ]
  const sheet = workbook.addWorksheet(options.sheetName.replace(/[:\\/?*[\]]/g, " ").slice(0, 31), {
    views: [{ state: "frozen", ySplit: headerRow }],
    pageSetup: { fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  sheet.columns = table.columns.map((column) => ({ width: Math.max(8, column.weight * 2) }));

  sheet.getCell(1, 1).value = table.title;
  sheet.getCell(1, 1).font = { bold: true, size: 14 };
  table.meta.forEach((line, index) => {
    sheet.getCell(index + 2, 1).value = line;
    sheet.getCell(index + 2, 1).font = { color: { argb: ARGB.muted } };
  });

  const header = sheet.getRow(headerRow);
  header.values = table.columns.map((column) => column.header);
  header.font = { bold: true };
  table.columns.forEach((column, index) => {
    const cell = header.getCell(index + 1);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    cell.alignment = { horizontal: column.align ?? "left" };
  });

  const write = (cells: ExportCell[], bold?: boolean) => {
    const row = sheet.addRow(table.columns.map((column, index) => resolve(cells[index], column).value));
    table.columns.forEach((column, index) => {
      const { value, tone, bold: strong } = resolve(cells[index], column, bold);
      const cell = row.getCell(index + 1);
      if (typeof value === "number") cell.numFmt = numberFormat(value);
      cell.alignment = { vertical: "top", horizontal: column.align ?? "left", wrapText: true };
      cell.font = { bold: strong, ...(tone ? { color: { argb: ARGB[tone] } } : {}) };
    });
    return row;
  };

  if (table.rows.length === 0) {
    sheet.addRow([table.empty]).font = { color: { argb: ARGB.muted } };
  }
  for (const cells of table.rows) write(cells);
  if (table.totals) {
    write(table.totals, true).eachCell({ includeEmpty: true }, (cell) => {
      cell.border = { top: { style: "thin" } };
    });
  }
  if (table.footnote) {
    sheet.addRow([]);
    sheet.addRow([table.footnote]).font = { color: { argb: ARGB.muted } };
  }
  if (table.rows.length > 0) {
    sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: table.columns.length } };
  }

  applyXlsxFonts(sheet);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// ───────────────────────────────── PDF ─────────────────────────────────

/**
 * PDF ไม่มีฟอนต์สำรองรายตัวอักษรเหมือนเบราว์เซอร์ — ข้อความหนึ่งบรรทัดอาจมีทั้งไทย ลาว และตัวเลข
 * จึงแบ่งเป็นช่วง ๆ: ตัวอักษรลาวใช้ Noto Sans Lao · ที่เหลือ (ไทย ละติน ตัวเลข) ใช้ Sarabun
 * ไม่มีฟอนต์จีน — route ส่งข้อความภาษาอังกฤษมาแทนเมื่อผู้ใช้เลือกภาษาจีน
 */
const FONT_DIR = join(process.cwd(), "assets", "fonts");
const FONTS = {
  base: join(FONT_DIR, "Sarabun-Regular.ttf"),
  baseBold: join(FONT_DIR, "Sarabun-Bold.ttf"),
  lao: join(FONT_DIR, "NotoSansLao-Regular.ttf"),
  laoBold: join(FONT_DIR, "NotoSansLao-Bold.ttf"),
};

const LAO = /[຀-໿]/;
/** สระบน/ล่างและวรรณยุกต์ไทย-ลาว — ห้ามตัดบรรทัดก่อนตัวเหล่านี้ (จะลอยแยกจากพยัญชนะ) */
const COMBINING = /[ัิ-ฺ็-๎ັິ-ຼ່-ໍ]/;
/** Noto Sans Lao มีแค่ตัวลาว + ช่องว่าง (ไม่มีตัวเลข/ละติน) — ช่องว่างเท่านั้นที่ต่อท้ายช่วงเดิมได้ */
const NEUTRAL = /\s/;

type Run = { lao: boolean; text: string };

export function splitRuns(text: string): Run[] {
  const runs: Run[] = [];
  for (const char of text) {
    const last = runs[runs.length - 1];
    const lao = LAO.test(char);
    if (last && (last.lao === lao || NEUTRAL.test(char))) last.text += char;
    else runs.push({ lao, text: char });
  }
  return runs;
}

/** ตัวอักษร 1 ตัว + สระ/วรรณยุกต์ที่ตามมา = หน่วยที่ตัดบรรทัดได้ */
function clusters(text: string) {
  const units: string[] = [];
  for (const char of text) {
    if (units.length && COMBINING.test(char)) units[units.length - 1] += char;
    else units.push(char);
  }
  return units;
}

const PAGE = { margin: 36, fontSize: 9.5, lineHeight: 14, padding: 4 };
const COLOR = { text: "#111827", border: "#d4d4d8", headerFill: "#f1f5f9" };
const TONE: Record<Tone, string> = { danger: "#dc2626", success: "#16a34a", muted: "#6b7280" };
/** บรรทัดสูงสุดต่อช่อง — ชื่อยาวมากถูกตัดด้วย "…" ไม่ให้แถวเดียวล้นหน้า */
const MAX_LINES = 4;

type Line = { text: string; tone?: Tone; bold?: boolean };
type Doc = PDFKit.PDFDocument;

function fontName(lao: boolean, bold?: boolean) {
  return lao ? (bold ? "laoBold" : "lao") : bold ? "baseBold" : "base";
}

function widthOf(doc: Doc, text: string, bold?: boolean) {
  let width = 0;
  for (const run of splitRuns(text)) width += doc.font(fontName(run.lao, bold)).widthOfString(run.text);
  return width;
}

/** ตัดบรรทัดตามความกว้างจริงของแต่ละฟอนต์ — ตัดที่ช่องว่างถ้ามี (ไทย/ลาวไม่เว้นวรรคจึงตัดกลางคำได้) */
function wrap(doc: Doc, line: Line, width: number, maxLines: number): Line[] {
  const lines: string[] = [];
  // เก็บเกิน maxLines หนึ่งบรรทัด เพื่อรู้ว่าต้องใส่ "…" หรือไม่
  paragraphs: for (const source of line.text.replace(/\r/g, "").split("\n")) {
    let current = "";
    for (const unit of clusters(source)) {
      if (current && widthOf(doc, current + unit, line.bold) > width) {
        const space = current.search(/\s\S*$/);
        const cut = space > 0 ? space + 1 : current.length;
        lines.push(current.slice(0, cut).trimEnd());
        if (lines.length > maxLines) break paragraphs;
        current = current.slice(cut).trimStart();
      }
      current += unit;
    }
    lines.push(current);
    if (lines.length > maxLines) break;
  }
  const overflow = lines.length > maxLines;
  return lines
    .slice(0, maxLines)
    .map((text, index) => ({ ...line, text: overflow && index === maxLines - 1 ? `${text} …` : text }));
}

function drawLine(doc: Doc, line: Line, x: number, y: number, width: number, align: "left" | "right") {
  let cursor = align === "right" ? x + width - widthOf(doc, line.text, line.bold) : x;
  doc.fillColor(line.tone ? TONE[line.tone] : COLOR.text);
  for (const run of splitRuns(line.text)) {
    doc.font(fontName(run.lao, line.bold));
    doc.text(run.text, cursor, y, { lineBreak: false });
    cursor += doc.widthOfString(run.text);
  }
}

export async function tableToPdf(table: ExportTable, options: ExportOptions): Promise<Buffer> {
  const { intl } = options;
  const doc = new PDFDocument({
    size: "A4",
    margin: PAGE.margin,
    bufferPages: true,
    font: FONTS.base,
    info: { Title: table.title, CreationDate: options.exportedAt },
  });
  for (const [name, path] of Object.entries(FONTS)) doc.registerFont(name, path);
  doc.fontSize(PAGE.fontSize);

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolveDone, reject) => {
    doc.on("end", () => resolveDone(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const left = PAGE.margin;
  const tableWidth = doc.page.width - PAGE.margin * 2;
  const weights = table.columns.reduce((sum, column) => sum + column.weight, 0);
  const widths = table.columns.map((column) => (column.weight / weights) * tableWidth);

  function layout(cells: ExportCell[], bold?: boolean) {
    const laidOut = table.columns.map((column, index) => {
      const { value, tone, bold: strong } = resolve(cells[index], column, bold);
      return wrap(doc, { text: display(value, intl), tone, bold: strong }, widths[index]! - PAGE.padding * 2, MAX_LINES);
    });
    const lineCount = Math.max(1, ...laidOut.map((lines) => lines.length));
    return { laidOut, height: lineCount * PAGE.lineHeight + PAGE.padding * 2 };
  }

  function drawRow(cells: ExportCell[], y: number, options: { fill?: string; bold?: boolean } = {}) {
    const { laidOut, height } = layout(cells, options.bold);
    if (options.fill) doc.rect(left, y, tableWidth, height).fill(options.fill);
    let x = left;
    laidOut.forEach((lines, index) => {
      const width = widths[index]!;
      const align = table.columns[index]!.align ?? "left";
      lines.forEach((line, i) =>
        drawLine(doc, line, x + PAGE.padding, y + PAGE.padding + i * PAGE.lineHeight, width - PAGE.padding * 2, align),
      );
      x += width;
    });
    doc
      .moveTo(left, y + height)
      .lineTo(left + tableWidth, y + height)
      .lineWidth(0.5)
      .strokeColor(COLOR.border)
      .stroke();
    return height;
  }

  const headerCells: ExportCell[] = table.columns.map((column) => column.header);
  const bottom = () => doc.page.height - PAGE.margin - PAGE.lineHeight; // เว้นที่ให้เลขหน้า
  let y = PAGE.margin;

  // หัวกระดาษหน้าแรก
  doc.fontSize(15);
  drawLine(doc, { text: table.title, bold: true }, left, y, tableWidth, "left");
  y += 24;
  doc.fontSize(PAGE.fontSize);
  for (const meta of table.meta) {
    for (const line of wrap(doc, { text: meta, tone: "muted" }, tableWidth, 3)) {
      drawLine(doc, line, left, y, tableWidth, "left");
      y += PAGE.lineHeight;
    }
  }
  y += 8;
  y += drawRow(headerCells, y, { fill: COLOR.headerFill, bold: true });

  const ensureSpace = (height: number) => {
    if (y + height <= bottom()) return;
    doc.addPage();
    y = PAGE.margin;
    y += drawRow(headerCells, y, { fill: COLOR.headerFill, bold: true });
  };

  if (table.rows.length === 0) {
    drawLine(doc, { text: table.empty, tone: "muted" }, left + PAGE.padding, y + PAGE.padding, tableWidth, "left");
    y += PAGE.lineHeight + PAGE.padding * 2;
  }
  for (const cells of table.rows) {
    ensureSpace(layout(cells).height);
    y += drawRow(cells, y);
  }
  if (table.totals) {
    ensureSpace(layout(table.totals, true).height);
    y += drawRow(table.totals, y, { fill: COLOR.headerFill, bold: true });
  }
  if (table.footnote) {
    ensureSpace(PAGE.lineHeight * 2);
    for (const line of wrap(doc, { text: table.footnote, tone: "muted" }, tableWidth, 3)) {
      drawLine(doc, line, left, y + 6, tableWidth, "left");
      y += PAGE.lineHeight;
    }
  }

  // เลขหน้าท้ายทุกหน้า — วาดหลังรู้จำนวนหน้าทั้งหมดแล้ว (bufferPages)
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index++) {
    doc.switchToPage(range.start + index);
    doc.page.margins.bottom = 0; // กัน pdfkit ขึ้นหน้าใหม่เองเมื่อเขียนในขอบล่าง
    drawLine(
      doc,
      { text: options.pageLabel(index + 1, range.count), tone: "muted" },
      left,
      doc.page.height - PAGE.margin,
      tableWidth,
      "right",
    );
  }

  doc.end();
  return done;
}

// ──────────────────────────── ใบสรุปส่งแม่หวย ────────────────────────────

/**
 * รูปแบบ "ใบสรุป" (เหมือนใบที่แม่หวยเขียนใน Excel เอง)
 *  ┌ กล่องซ้าย (V3 V4 V8 V9 · ລວມ · ເປີເຊັນ · ເຫຼືອ) ┐   ┌ กล่องขวา (V5 V6 V7 LAO THAI · ລວມ · ເປີເຊັນ · ເຫຼືອ) ┐
 *  └ ใต้กล่องซ้าย: ຖືກ 2ໂຕ · ຖືກ 3ໂຕ · ເຫຼືອ · ຄ້າງ · ສົ່ງແມ່ ┘
 *  ด้านล่าง: ตารางเลข 3 คอลัมน์ (ລ/ດ · ກີບ · ບາດ)
 * ข้อความแปลแล้วทั้งหมด ไฟล์นี้แค่จัดวาง
 */
export type SheetStyle = {
  /** พื้นสีเขียวอ่อน (แถวรวม / หัวตาราง) */
  fill?: boolean;
  red?: boolean;
  bold?: boolean;
  /** เส้นใต้ตัวเลข: single = ยอดรวม · double = ยอดส่งแม่ */
  underline?: "single" | "double";
};

export type SheetLine = { label: string; lak: ExportValue; thb: ExportValue; style?: SheetStyle };

export type SheetExport = {
  title: string;
  meta: string[];
  /** หัวคอลัมน์ของกล่องสรุป: [ว่าง, กีบ, บาท] */
  header: [string, string, string];
  left: SheetLine[];
  right: SheetLine[];
  /** ใต้กล่องซ้าย: ยอดถูก → เหลือ → ค้าง → ส่งแม่ */
  result: SheetLine[];
  /** หัวคอลัมน์ของตารางล่าง: [ลำดับ, กีบ, บาท] */
  tableHeader: [string, string, string];
  /** แถวรวมเหนือรายการ (เหมือนในใบ) */
  tableTotal: [string, number, number];
  rows: [string, number, number][];
};

const SHEET_FILL = "FFE2EFDA";
const SHEET_RED = "FFDC2626";
/** ฟอนต์ของไฟล์ Excel: ข้อความลาว = Phetsarath OT · ตัวเลขและตัวอื่น = Times New Roman */
export const XLSX_FONTS = { lao: "Phetsarath OT", other: "Times New Roman" } as const;

/**
 * ตั้งฟอนต์ทุกช่องของชีต (ใช้กับไฟล์ Excel ทุกแบบ) — ช่องที่มีทั้งตัวลาวและตัวเลข/ละตินแบ่งเป็น rich text
 * ให้แต่ละช่วงได้ฟอนต์ของตัวเอง โดยคงขนาด/ตัวหนา/สี/เส้นใต้เดิมของช่องไว้
 */
export function applyXlsxFonts(sheet: ExcelJS.Worksheet) {
  sheet.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const font = cell.font ?? {};
      const value = cell.value;
      if (typeof value !== "string" || !LAO.test(value)) {
        cell.font = { ...font, name: XLSX_FONTS.other };
        return;
      }
      const runs = splitRuns(value);
      cell.font = { ...font, name: XLSX_FONTS.lao };
      if (runs.length > 1) {
        cell.value = {
          richText: runs.map((run) => ({ text: run.text, font: { ...font, name: run.lao ? XLSX_FONTS.lao : XLSX_FONTS.other } })),
        };
      }
    });
  });
}

export async function sheetToXlsx(sheet: SheetExport, options: ExportOptions): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = options.exportedAt;
  const ws = workbook.addWorksheet(options.sheetName.replace(/[:\\/?*[\]]/g, " ").slice(0, 31), {
    pageSetup: { fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  // กล่องซ้าย A–C · ช่องว่าง D · กล่องขวา E–G
  ws.columns = [{ width: 12 }, { width: 16 }, { width: 16 }, { width: 4 }, { width: 12 }, { width: 16 }, { width: 16 }];

  ws.getCell(1, 1).value = sheet.title;
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  sheet.meta.forEach((line, index) => {
    ws.getCell(index + 2, 1).value = line;
    ws.getCell(index + 2, 1).font = { color: { argb: ARGB.muted } };
  });

  const border = { style: "thin" as const, color: { argb: "FF9CA3AF" } };
  const box = { top: border, bottom: border, left: border, right: border };
  const fill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: SHEET_FILL } };
  // ศูนย์ในกล่องสรุปแสดง "-" (เหมือนรูปแบบบัญชีใน Excel) แต่ยังเป็นตัวเลขจริง
  const summaryFormat = (value: number) => (Number.isInteger(value) ? '#,##0;-#,##0;"-"' : '#,##0.00;-#,##0.00;"-"');

  /** เขียน 3 ช่อง (ป้าย · กีบ · บาท) ที่แถว row เริ่มคอลัมน์ col */
  const put = (row: number, col: number, values: ExportValue[], style: SheetStyle = {}, zero: "dash" | "blank" = "dash") => {
    values.forEach((value, index) => {
      const cell = ws.getCell(row, col + index);
      cell.value = zero === "blank" && value === 0 ? null : value;
      if (typeof value === "number") cell.numFmt = zero === "dash" ? summaryFormat(value) : numberFormat(value);
      cell.border = box;
      cell.alignment = { horizontal: index === 0 ? "center" : "right", vertical: "middle" };
      cell.font = {
        bold: style.bold,
        underline: index > 0 && style.underline ? (style.underline === "double" ? "double" : true) : undefined,
        size: style.underline === "double" ? 13 : undefined,
        ...(style.red ? { color: { argb: SHEET_RED } } : {}),
      };
      if (style.fill) cell.fill = fill;
    });
  };
  const putLines = (row: number, col: number, lines: SheetLine[]) =>
    lines.forEach((line, index) => put(row + index, col, [line.label, line.lak, line.thb], line.style));

  const top = sheet.meta.length + 3;
  put(top, 1, sheet.header, { fill: true, bold: true });
  putLines(top + 1, 1, sheet.left);
  put(top, 5, sheet.header, { fill: true, bold: true });
  putLines(top + 1, 5, sheet.right);
  const resultTop = top + 1 + sheet.left.length + 1; // เว้นหนึ่งแถวใต้กล่องซ้าย
  putLines(resultTop, 1, sheet.result);
  const lastSummary = ws.getRow(resultTop + sheet.result.length - 1);
  lastSummary.height = 24; // แถวส่งแม่ตัวใหญ่

  const tableTop = Math.max(resultTop + sheet.result.length, top + 1 + sheet.right.length) + 1;
  put(tableTop, 1, sheet.tableHeader, { fill: true, bold: true });
  put(tableTop + 1, 1, sheet.tableTotal, { fill: true, bold: true, underline: "single" }, "blank");
  sheet.rows.forEach((row, index) => put(tableTop + 2 + index, 1, row, {}, "blank"));
  ws.views = [{ state: "frozen", ySplit: tableTop + 1 }];

  applyXlsxFonts(ws);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function sheetToPdf(sheet: SheetExport, options: ExportOptions): Promise<Buffer> {
  const { intl } = options;
  const doc = new PDFDocument({
    size: "A4",
    margin: PAGE.margin,
    bufferPages: true,
    font: FONTS.base,
    info: { Title: sheet.title, CreationDate: options.exportedAt },
  });
  for (const [name, path] of Object.entries(FONTS)) doc.registerFont(name, path);

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolveDone, reject) => {
    doc.on("end", () => resolveDone(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const left = PAGE.margin;
  const pageWidth = doc.page.width - PAGE.margin * 2;
  const widths = [72, 89, 89];
  const boxWidth = widths.reduce((sum, width) => sum + width, 0);
  const rightX = left + pageWidth - boxWidth;
  const rowHeight = 17;
  const pad = 6;
  const RED = TONE.danger;
  const FILL = "#e2efda";
  const bottom = () => doc.page.height - PAGE.margin - PAGE.lineHeight;
  let y = PAGE.margin;

  doc.fontSize(15);
  drawLine(doc, { text: sheet.title, bold: true }, left, y, pageWidth, "left");
  y += 24;
  doc.fontSize(PAGE.fontSize);
  for (const meta of sheet.meta) {
    for (const line of wrap(doc, { text: meta, tone: "muted" }, pageWidth, 3)) {
      drawLine(doc, line, left, y, pageWidth, "left");
      y += PAGE.lineHeight;
    }
  }
  y += 8;

  /** วาดหนึ่งแถว (ป้าย · กีบ · บาท) ที่ตำแหน่ง x, rowY — zero: ศูนย์แสดง "-" หรือเว้นว่าง */
  function drawRow(x0: number, rowY: number, values: ExportValue[], style: SheetStyle = {}, zero: "dash" | "blank" = "dash") {
    if (style.fill) doc.rect(x0, rowY, boxWidth, rowHeight).fill(FILL);
    let x = x0;
    values.forEach((value, index) => {
      const width = widths[index]!;
      const text = value === 0 ? (zero === "dash" ? "-" : "") : display(value, intl);
      const [line] = wrap(doc, { text, bold: style.bold, tone: style.red ? "danger" : undefined }, width - pad * 2, 1);
      if (line && line.text) {
        // คอลัมน์แรก (ป้าย/ลำดับ) จัดกลาง · ตัวเลขชิดขวา
        const textX = index === 0 ? x + Math.max(pad, (width - widthOf(doc, line.text, style.bold)) / 2) : x + pad;
        drawLine(doc, line, textX, rowY + 0.5, width - pad * 2, index === 0 ? "left" : "right");
        if (style.underline && index > 0 && value !== 0) {
          const lineWidth = widthOf(doc, line.text, style.bold);
          doc.lineWidth(0.6).strokeColor(style.red ? RED : COLOR.text);
          for (const offset of style.underline === "double" ? [2, 0.5] : [2]) {
            const underY = rowY + rowHeight - offset;
            doc.moveTo(x + width - pad - lineWidth, underY).lineTo(x + width - pad, underY).stroke();
          }
        }
      }
      doc.rect(x, rowY, width, rowHeight).lineWidth(0.5).strokeColor("#9ca3af").stroke();
      x += width;
    });
  }
  const drawLines = (x0: number, startY: number, lines: SheetLine[]) =>
    lines.forEach((line, index) => drawRow(x0, startY + index * rowHeight, [line.label, line.lak, line.thb], line.style));

  drawRow(left, y, sheet.header, { fill: true, bold: true });
  drawLines(left, y + rowHeight, sheet.left);
  drawRow(rightX, y, sheet.header, { fill: true, bold: true });
  drawLines(rightX, y + rowHeight, sheet.right);
  const resultY = y + rowHeight * (sheet.left.length + 2);
  drawLines(left, resultY, sheet.result);
  y = Math.max(resultY + rowHeight * sheet.result.length, y + rowHeight * (sheet.right.length + 1)) + 16;

  const tableHead = () => {
    drawRow(left, y, sheet.tableHeader, { fill: true, bold: true });
    y += rowHeight;
  };
  tableHead();
  drawRow(left, y, sheet.tableTotal, { fill: true, bold: true, underline: "single" }, "blank");
  y += rowHeight;
  for (const row of sheet.rows) {
    if (y + rowHeight > bottom()) {
      doc.addPage();
      y = PAGE.margin;
      tableHead();
    }
    drawRow(left, y, row, {}, "blank");
    y += rowHeight;
  }

  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index++) {
    doc.switchToPage(range.start + index);
    doc.page.margins.bottom = 0;
    drawLine(
      doc,
      { text: options.pageLabel(index + 1, range.count), tone: "muted" },
      left,
      doc.page.height - PAGE.margin,
      pageWidth,
      "right",
    );
  }

  doc.end();
  return done;
}
