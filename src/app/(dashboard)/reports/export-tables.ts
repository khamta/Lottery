import type { DrawStatusValue } from "@/lib/validations/draw";
import { formatDate } from "@/lib/utils";
import { currencyKey, digitsKey, positionKey } from "@/lottery/labels";
import type { Currency, Position } from "@/lottery/parser";
import { CUSTOMER_SUMMARY_MAX, WINNING_BETS_MAX, type CustomerSummary, type WinningBet } from "@/lottery/queries";
import {
  findOverLimits,
  pivotThreeDigit,
  pivotTwoDigit,
  resolveLimit,
  sumTwoDigit,
  type LimitRule,
  type StakeGroup,
  type WinningKey,
} from "@/lottery/report";
import type { ExportCell, ExportColumn, ExportTable } from "@/lottery/table-export";
import { statusKey } from "../draws/types";
import { viewKey, type ReportView, type TopOption } from "./types";

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
