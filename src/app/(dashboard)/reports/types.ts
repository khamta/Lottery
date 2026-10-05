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

/** เปอร์เซ็นต์ที่หักในใบสรุปส่งแม่ (?pl= กล่องซ้าย V3 V4 V8 V9 · ?pr= กล่องขวา V5 V6 V7 ลาว ไทย) */
export const DEFAULT_PERCENTS = { left: 15, right: 30 } as const;

/** อ่านเปอร์เซ็นต์จาก URL — อ่านไม่ได้ = fallback · ตัดให้อยู่ใน 0–100 */
export function toPercent(value: unknown, fallback: number): number {
  const parsed = typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(0, Math.round(parsed * 100) / 100));
}

/** อ่านยอดเงินจาก URL (ยอดค้าง) — ติดลบได้ · อ่านไม่ได้ = 0 */
export function toAmount(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value.replace(/,/g, "")) : Number.NaN;
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

/** ชื่อหัวกลุ่มในรายงานตามบิล — กลุ่มจริงใช้ชื่อกลุ่ม · ไม่รู้กลุ่ม / คีย์เอง ใช้ข้อความแปล */
export function billGroupName(group: Pick<BillGroup, "kind" | "name">, t: (key: string) => string) {
  if (group.kind === "manual") return t("tickets.sourceMANUAL");
  if (group.kind === "whatsapp") return t("reports.billsUnknownGroup");
  return group.name ?? t("reports.billsUnknownGroup");
}

/** ตัวเลือกกลุ่มของรายงาน (?group=) — key = WhatsappGroup.id หรือ NO_GROUP · name null = NO_GROUP (แปลตอนแสดง) · bills = จำนวนบิลในงวด */
export type ReportGroupOption = { key: string; name: string | null; bills: number };

/** ชื่อกลุ่มที่แสดง — NO_GROUP ใช้ข้อความแปล */
export function reportGroupName(group: Pick<ReportGroupOption, "name">, t: (key: string) => string) {
  return group.name ?? t("tickets.groupNone");
}
