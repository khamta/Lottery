import type { BillGroup } from "@/lottery/queries";

/** มุมมองของรายงาน — เก็บใน URL (?view=) */
export const REPORT_VIEWS = ["two", "three", "customers", "bills", "limits", "winners"] as const;
export type ReportView = (typeof REPORT_VIEWS)[number];

export function isReportView(value: unknown): value is ReportView {
  return (REPORT_VIEWS as readonly unknown[]).includes(value);
}

export const viewKey: Record<ReportView, string> = {
  two: "reports.viewTwo",
  three: "reports.viewThree",
  customers: "reports.viewCustomers",
  bills: "reports.viewBills",
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

/** เปอร์เซ็นต์ที่หักในใบสรุปส่งแม่ (?percent=) — ค่าเริ่มต้น 30 · ตัดให้อยู่ใน 0–100 */
export const DEFAULT_PERCENT = 30;

export function toPercent(value: unknown): number {
  const parsed = typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) return DEFAULT_PERCENT;
  return Math.min(100, Math.max(0, Math.round(parsed * 100) / 100));
}

/** ชื่อหัวกลุ่มในรายงานตามบิล — กลุ่มจริงใช้ชื่อกลุ่ม · ไม่รู้กลุ่ม / คีย์เอง ใช้ข้อความแปล */
export function billGroupName(group: Pick<BillGroup, "kind" | "name">, t: (key: string) => string) {
  if (group.kind === "manual") return t("tickets.sourceMANUAL");
  if (group.kind === "whatsapp") return t("reports.billsUnknownGroup");
  return group.name ?? t("reports.billsUnknownGroup");
}
