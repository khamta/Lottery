export type UserRow = {
  id: string;
  name: string | null;
  email: string;
  role: "ADMIN" | "USER";
  isActive: boolean;
  /** heartbeat ล่าสุด (ISO) — null = ออกจากระบบแล้ว/ไม่เคยเข้า */
  lastSeenAt: string | null;
  /** คำนวณที่ server ตอน render เพื่อให้ server/client ได้ผลตรงกัน */
  online: boolean;
  createdAt: string;
};

export const USER_SORTABLE = ["name", "email", "role", "lastSeenAt", "createdAt"] as const;
