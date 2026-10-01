/** ชนิดการกระทำ — ต้องตรงกับ enum AuditAction ใน prisma/schema.prisma */
export const AUDIT_ACTIONS = ["CREATE", "UPDATE", "DELETE"] as const;
export type AuditActionValue = (typeof AUDIT_ACTIONS)[number];

/** ค่าใน changes (Json) — มาจาก Prisma เป็น JSON ล้วน จึงส่งข้าม server→client ได้ตรง ๆ */
export type AuditJsonValue =
  | string
  | number
  | boolean
  | null
  | AuditJsonValue[]
  | { [key: string]: AuditJsonValue };

/** รูปแบบข้อมูลที่ส่งจาก server ไป client (Date -> string) */
export type AuditLogRow = {
  id: string;
  action: AuditActionValue;
  entity: string;
  entityId: string | null;
  summary: string | null;
  /** CREATE: {field: {to}} · UPDATE: {field: {from, to}} · DELETE: {field: {from}} */
  changes: AuditJsonValue;
  /** ผู้กระทำ ณ ปัจจุบัน — null เมื่อบัญชีถูกลบไปแล้ว (ใช้ userName ที่บันทึกไว้แทน) */
  actor: { name: string | null; email: string; image: string | null } | null;
  /** ชื่อ/อีเมลของผู้กระทำ ณ เวลาที่เกิดเหตุการณ์ */
  userName: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};

/** คอลัมน์ที่ยอมให้เรียงได้ — ชื่อต้องตรงกับ field ใน Prisma */
export const AUDIT_LOG_SORTABLE = ["createdAt", "action", "entity", "userName"] as const;

/** การกระทำ -> คีย์ i18n */
export const actionKey: Record<AuditActionValue, string> = {
  CREATE: "auditLogs.actionCREATE",
  UPDATE: "auditLogs.actionUPDATE",
  DELETE: "auditLogs.actionDELETE",
};

/** ชื่อ entity ที่รู้จัก -> คีย์ i18n (entity อื่นแสดงชื่อดิบ) — project เพิ่มได้ที่ src/config/audit.ts */
export { auditEntityKeys as entityKey } from "@/config/audit";

export function isAuditAction(value: unknown): value is AuditActionValue {
  return typeof value === "string" && (AUDIT_ACTIONS as readonly string[]).includes(value);
}
