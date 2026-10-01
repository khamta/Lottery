import type { MemberRoleValue } from "@/lib/validations/member";

/** รูปแบบข้อมูลที่ส่งจาก server ไป client (Date -> string) */
export type MemberRow = {
  id: string;
  name: string | null;
  email: string;
  role: MemberRoleValue;
  isActive: boolean;
  /** heartbeat ล่าสุด (ISO) — null = ออกจากระบบแล้ว/ไม่เคยเข้า */
  lastSeenAt: string | null;
  /** คำนวณที่ server ตอน render เพื่อให้ server/client ได้ผลตรงกัน */
  online: boolean;
  dealerCount: number;
  whatsappCount: number;
  /** บัญชีของผู้ดูแลที่เปิดหน้านี้อยู่ — ลดสิทธิ์/ปิด/ลบตัวเองไม่ได้ */
  isSelf: boolean;
  createdAt: string;
};

/** คอลัมน์ที่ยอมให้เรียงได้ — ชื่อต้องตรงกับ field ใน Prisma */
export const MEMBER_SORTABLE = ["name", "email", "role", "isActive", "lastSeenAt", "createdAt"] as const;

/** สิทธิ์ -> คีย์ i18n */
export const roleKey: Record<MemberRoleValue, string> = {
  ADMIN: "members.roleADMIN",
  USER: "members.roleUSER",
};
