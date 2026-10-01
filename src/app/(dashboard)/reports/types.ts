/** มุมมองของรายงาน — เก็บใน URL (?view=) */
export const REPORT_VIEWS = ["two", "three", "customers", "limits", "winners"] as const;
export type ReportView = (typeof REPORT_VIEWS)[number];

export function isReportView(value: unknown): value is ReportView {
  return (REPORT_VIEWS as readonly unknown[]).includes(value);
}

export const viewKey: Record<ReportView, string> = {
  two: "reports.viewTwo",
  three: "reports.viewThree",
  customers: "reports.viewCustomers",
  limits: "reports.viewLimits",
  winners: "reports.viewWinners",
};

/** จำนวนอันดับที่แสดงในตารางเลข (?top=) — 0 = ทั้งหมด */
export const TOP_OPTIONS = [40, 100, 0] as const;
export type TopOption = (typeof TOP_OPTIONS)[number];
export const DEFAULT_TOP: TopOption = 40;

export function toTopOption(value: unknown): TopOption {
  const parsed = Number(value);
  return value !== undefined && (TOP_OPTIONS as readonly number[]).includes(parsed)
    ? (parsed as TopOption)
    : DEFAULT_TOP;
}

export type DrawOption = { id: string; name: string };
