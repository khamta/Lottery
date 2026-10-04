import type { DrawStatusValue } from "@/lib/validations/draw";
import { formatDate } from "@/lib/utils";
import { isoToDate } from "@/lottery/date";
import { formatDateTimeSeconds, formatNumber } from "@/lottery/format";
import { currencyKey, digitsKey, positionKey } from "@/lottery/labels";
import type { Currency, Position } from "@/lottery/parser";
import {
  CUSTOMER_SUMMARY_MAX,
  DRAW_BILLS_MAX,
  WINNING_BETS_MAX,
  type BillGroup,
  type CustomerSummary,
  type WinningBet,
} from "@/lottery/queries";
import {
  buildSettlement,
  findOverLimits,
  pivotThreeDigit,
  pivotTwoDigit,
  resolveLimit,
  sumTwoDigit,
  type LimitRule,
  type MoneyPair,
  type Settlement,
  type SettlementDraw,
  type StakeGroup,
  type WinningKey,
} from "@/lottery/report";
import type { ExportCell, ExportColumn, ExportTable, SheetExport, SheetLine } from "@/lottery/table-export";
import { statusKey } from "../draws/types";
import { billGroupName, viewKey, type ReportView, type TopOption } from "./types";

/**
 * ตารางของแต่ละมุมมองรายงาน → ExportTable (src/lottery/table-export.ts) สำหรับไฟล์ Excel / PDF
 * คิดจากข้อมูลและฟังก์ชันชุดเดียวกับหน้ารายงาน ไฟล์จึงตรงกับที่เห็นบนจอ (รวมจำนวนอันดับ ?top= ที่เลือก)
 * ฟังก์ชันล้วน — route ดึงข้อมูลมาให้ (export/route.ts)
 */
export type ReportExportInput = {
  t: (key: string, params?: Record<string, string | number>) => string;
  intl: string;
  view: ReportView;
  top: TopOption;
  draw: { name: string; status: DrawStatusValue };
  keys: WinningKey[] | null;
  exportedAt: Date;
  /** ยอดต่อเลข — ใช้กับมุมมอง two / three / limits */
  stakes: StakeGroup[];
  limits: LimitRule[];
  /** ใช้กับมุมมอง customers */
  customers: CustomerSummary[];
  /** ใช้กับมุมมอง winners */
  winners: WinningBet[];
  /** ใช้กับมุมมอง bills */
  bills: BillGroup[];
};

const money = (header: string): ExportColumn => ({ header, weight: 14, align: "right", dimZero: true });

export function buildReportTable(input: ReportExportInput): ExportTable {
  const { t, intl, view, top, draw, keys } = input;
  const result = keys
    ? t("reports.result", { top: keys[0]!.number, top2: keys[1]!.number, bottom: keys[2]!.number })
    : t("reports.noResultYet");
  const ranked = view === "two" || view === "three";
  const meta = [
    `${draw.name} · ${t(statusKey[draw.status])} · ${result}`,
    [
      `${t("reports.exportedAt")}: ${formatDate(input.exportedAt, intl)}`,
      ...(ranked ? [top ? t("reports.topN", { count: top }) : t("reports.topAll")] : []),
    ].join(" · "),
  ];
  const base = { title: `${t("reports.title")} — ${t(viewKey[view])}`, meta };

  /** ยอดที่เกินเพดานอั้น = สีแดง (เหมือนตารางบนจอ) */
  const stake = (amount: number, bet: { number: string; digits: number; position: Position; currency: Currency }) => {
    const limit = resolveLimit(input.limits, bet);
    return limit !== null && amount > limit ? { value: amount, tone: "danger" as const, bold: true } : amount;
  };
  /** เลขที่ออก = สีเขียว + ป้ายกำกับ */
  const numberCell = (number: string, labels: string[]): ExportCell =>
    labels.length ? { value: `${number} · ${labels.join(" · ")}`, tone: "success", bold: true } : { value: number, bold: true };
  const typeOf = (bet: { digits: number; position: Position }) =>
    `${t(digitsKey[bet.digits] ?? "lottery.digits2")} ${t(positionKey[bet.position])}`;

  switch (view) {
    case "two": {
      const all = pivotTwoDigit(input.stakes);
      const totals = sumTwoDigit(all);
      const winning = keys ? { top: keys[1]!.number, bottom: keys[2]!.number } : null;
      return {
        ...base,
        columns: [
          { header: t("lottery.rank"), weight: 7, align: "right" },
          { header: t("lottery.number"), weight: 16 },
          money(t("lottery.topLak")),
          money(t("lottery.bottomLak")),
          money(t("lottery.topThb")),
          money(t("lottery.bottomThb")),
        ],
        rows: (top ? all.slice(0, top) : all).map((row, index) => [
          index + 1,
          numberCell(row.number, [
            ...(winning?.top === row.number ? [t("lottery.winTop")] : []),
            ...(winning?.bottom === row.number ? [t("lottery.winBottom")] : []),
          ]),
          stake(row.topLak, { number: row.number, digits: 2, position: "TOP", currency: "LAK" }),
          stake(row.bottomLak, { number: row.number, digits: 2, position: "BOTTOM", currency: "LAK" }),
          stake(row.topThb, { number: row.number, digits: 2, position: "TOP", currency: "THB" }),
          stake(row.bottomThb, { number: row.number, digits: 2, position: "BOTTOM", currency: "THB" }),
        ]),
        // ยอดรวมของทุกเลข ไม่ใช่เฉพาะแถวที่แสดง (เหมือนบนจอ)
        totals: all.length ? [null, t("lottery.totalAll"), totals.topLak, totals.bottomLak, totals.topThb, totals.bottomThb] : undefined,
        empty: t("reports.emptyBets"),
      };
    }

    case "three": {
      const all = pivotThreeDigit(input.stakes);
      const winning = keys ? keys[0]!.number : null;
      return {
        ...base,
        columns: [
          { header: t("lottery.rank"), weight: 7, align: "right" },
          { header: t("lottery.number"), weight: 18 },
          money(t("lottery.currencyLAK")),
          money(t("lottery.currencyTHB")),
        ],
        rows: (top ? all.slice(0, top) : all).map((row, index) => [
          index + 1,
          numberCell(row.number, winning === row.number ? [t("lottery.winTop")] : []),
          stake(row.lak, { number: row.number, digits: 3, position: "TOP", currency: "LAK" }),
          stake(row.thb, { number: row.number, digits: 3, position: "TOP", currency: "THB" }),
        ]),
        totals: all.length
          ? [
              null,
              t("lottery.totalAll"),
              all.reduce((sum, row) => sum + row.lak, 0),
              all.reduce((sum, row) => sum + row.thb, 0),
            ]
          : undefined,
        empty: t("reports.emptyBets"),
      };
    }

    case "customers": {
      const rows = input.customers;
      const sum = (pick: (row: CustomerSummary) => number) => rows.reduce((total, row) => total + pick(row), 0);
      return {
        ...base,
        columns: [
          { header: t("reports.customer"), weight: 30 },
          { header: t("reports.ticketCount"), weight: 9, align: "right" },
          money(t("reports.stakeLak")),
          money(t("reports.stakeThb")),
          ...(keys ? [money(t("reports.wonLak")), money(t("reports.wonThb"))] : []),
        ],
        rows: rows.map((row) => [
          row.name ? { value: row.name, bold: true } : { value: t("reports.noCustomer"), tone: "muted" as const },
          row.tickets,
          row.stake.lak,
          row.stake.thb,
          ...(keys ? [{ value: row.won.lak, bold: true }, { value: row.won.thb, bold: true }] : []),
        ]),
        totals: rows.length
          ? [
              t("reports.exportTotal"),
              sum((row) => row.tickets),
              sum((row) => row.stake.lak),
              sum((row) => row.stake.thb),
              ...(keys ? [sum((row) => row.won.lak), sum((row) => row.won.thb)] : []),
            ]
          : undefined,
        empty: t("reports.emptyBets"),
        footnote: rows.length === CUSTOMER_SUMMARY_MAX ? t("reports.exportCustomersMax", { count: CUSTOMER_SUMMARY_MAX }) : undefined,
      };
    }

    case "bills": {
      // หนึ่งแถวหัวกลุ่ม (ชื่อกลุ่ม + ยอดรวมของกลุ่ม) แล้วตามด้วยบิลของกลุ่มเรียงตามเวลา
      const count = input.bills.reduce((sum, group) => sum + group.bills.length, 0);
      return {
        ...base,
        columns: [
          { header: t("tickets.billNo"), weight: 16 },
          { header: t("tickets.createdAt"), weight: 18 },
          { header: t("reports.customer"), weight: 22 },
          { header: t("tickets.betCount"), weight: 8, align: "right" },
          money(t("tickets.totalLak")),
          money(t("tickets.totalThb")),
          { header: t("tickets.status"), weight: 11 },
        ],
        rows: input.bills.flatMap((group) => [
          [
            { value: `${billGroupName(group, t)} · ${t("reports.billCount", { count: group.bills.length })}`, bold: true },
            null,
            null,
            null,
            { value: group.total.lak, bold: true },
            { value: group.total.thb, bold: true },
            null,
          ],
          ...group.bills.map((bill): ExportCell[] => [
            bill.billNo,
            formatDateTimeSeconds(bill.createdAt, intl),
            bill.name ?? { value: t("reports.noCustomer"), tone: "muted" },
            bill.betCount,
            bill.lak,
            bill.thb,
            bill.status === "CONFIRMED" ? t("tickets.statusCONFIRMED") : { value: t("tickets.statusREVIEW"), tone: "danger" },
          ]),
        ]),
        totals: count
          ? [
              t("reports.exportTotal"),
              null,
              t("reports.billCount", { count }),
              input.bills.reduce((sum, group) => sum + group.bills.reduce((s, bill) => s + bill.betCount, 0), 0),
              input.bills.reduce((sum, group) => sum + group.total.lak, 0),
              input.bills.reduce((sum, group) => sum + group.total.thb, 0),
              null,
            ]
          : undefined,
        empty: t("reports.emptyBets"),
        footnote: count === DRAW_BILLS_MAX ? t("reports.billsMax", { count: DRAW_BILLS_MAX }) : undefined,
      };
    }

    case "limits":
      return {
        ...base,
        columns: [
          { header: t("lottery.number"), weight: 12 },
          { header: t("reports.type"), weight: 16 },
          { header: t("reports.currency"), weight: 10 },
          money(t("reports.stake")),
          { ...money(t("reports.limit")), dimZero: false },
          money(t("reports.excess")),
        ],
        rows: findOverLimits(input.stakes, input.limits).map((row) => [
          { value: row.number, bold: true },
          typeOf(row),
          t(currencyKey[row.currency]),
          row.amount,
          { value: row.limit, tone: "muted" },
          { value: row.excess, tone: "danger", bold: true },
        ]),
        empty: t("reports.emptyLimits"),
      };

    case "winners":
      return {
        ...base,
        columns: [
          { header: t("reports.customer"), weight: 30 },
          { header: t("lottery.number"), weight: 10 },
          { header: t("reports.type"), weight: 16 },
          { header: t("reports.currency"), weight: 10 },
          money(t("reports.amount")),
        ],
        rows: input.winners.map((bet) => [
          bet.customerName ? { value: bet.customerName, bold: true } : { value: t("reports.noCustomer"), tone: "muted" as const },
          { value: bet.number, bold: true },
          typeOf(bet),
          t(currencyKey[bet.currency]),
          { value: bet.amount, bold: true },
        ]),
        empty: keys ? t("reports.emptyWinners") : t("reports.noResult"),
        footnote: input.winners.length === WINNING_BETS_MAX ? t("reports.truncated", { count: WINNING_BETS_MAX }) : undefined,
      };
  }
}

export type SettlementExportInput = {
  t: ReportExportInput["t"];
  intl: string;
  /** วันที่ของใบ (YYYY-MM-DD) — ใบหนึ่งรวมทุกงวดของวันนั้น (หวยเวียดนามหลายรอบ + ลาว + ไทย) */
  date: string;
  /** งวดของวันนั้น พร้อมชื่อไว้แสดงในหัวใบ */
  draws: (SettlementDraw & { name: string })[];
  exportedAt: Date;
  /** เปอร์เซ็นต์ที่หักของกล่องซ้าย (V3 V4 V8 V9) / กล่องขวา (V5 V6 V7 ลาว ไทย) — ผู้ใช้ตั้งเองตอนส่งออก */
  percents: { left: number; right: number };
  /** ยอดค้าง (ผู้ใช้กรอกเองตอนส่งออก) */
  outstanding: MoneyPair;
  /** ยอดของแต่ละบิล (ที่นับยอดแล้ว) ของทุกงวดในวันนั้น เรียงตามเวลา — ตารางล่าง */
  bills: MoneyPair[];
};

/** ใบสรุปส่งแม่ของทั้งวัน: สองกล่องตามประเภทหวย → ถูก 2 ตัว / 3 ตัว → เหลือ → ค้าง → ส่งแม่ + ตารางยอดรายบิล */
export function buildSettlementSheet(input: SettlementExportInput): SheetExport {
  const { t, intl } = input;
  const s = buildSettlement(input.draws, input.percents, input.outstanding, input.bills);
  const percent = (value: number) => `${formatNumber(value, intl)}%`;

  const box = (part: Settlement["left"]): SheetLine[] => [
    ...part.lines.map((line) => ({ label: line.lottery, lak: line.amount.lak, thb: line.amount.thb })),
    { label: t("reports.sheetTotal"), lak: part.total.lak, thb: part.total.thb, style: { fill: true, underline: "single" } },
    { label: t("reports.sheetPercent"), lak: percent(part.percent), thb: percent(part.percent), style: { fill: true } },
    { label: t("reports.sheetNet"), lak: part.net.lak, thb: part.net.thb, style: { fill: true, underline: "single" } },
  ];
  const red = { red: true } as const;

  return {
    title: `${t("reports.sheetTitle")} — ${formatDate(isoToDate(input.date), intl, "date")}`,
    meta: [
      input.draws.length
        ? `${t("reports.sheetDraws")}: ${input.draws.map((draw) => draw.name).join(" · ")}`
        : t("reports.sheetNoDraws"),
      `${t("reports.exportedAt")}: ${formatDate(input.exportedAt, intl)}`,
    ],
    header: ["", t("lottery.currencyLAK"), t("lottery.currencyTHB")],
    left: box(s.left),
    right: box(s.right),
    result: [
      { label: t("reports.sheetWin2"), lak: s.win2.lak, thb: s.win2.thb, style: red },
      { label: t("reports.sheetWin3"), lak: s.win3.lak, thb: s.win3.thb, style: red },
      { label: t("reports.sheetNet"), lak: s.remain.lak, thb: s.remain.thb, style: { underline: "single" } },
      { label: t("reports.sheetOutstanding"), lak: s.outstanding.lak, thb: s.outstanding.thb },
      { label: t("reports.sheetSend"), lak: s.send.lak, thb: s.send.thb, style: { fill: true, red: true, bold: true, underline: "double" } },
    ],
    tableHeader: [t("reports.sheetSeq"), t("lottery.currencyLAK"), t("lottery.currencyTHB")],
    tableTotal: [t("reports.sheetTotal"), s.rowsTotal.lak, s.rowsTotal.thb],
    rows: s.rows.map((row) => [row.seq, row.lak, row.thb]),
  };
}
