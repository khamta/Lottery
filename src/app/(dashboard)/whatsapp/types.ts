/** สถานะการเชื่อมต่อที่บอทรายงาน (ตรงกับ enum WhatsappStatus ใน Prisma) */
export type WhatsappStatusValue = "STARTING" | "QR" | "CONNECTED" | "DISCONNECTED" | "LOGGED_OUT";

/** รูปแบบข้อมูลที่ส่งจาก server ไป client (Date -> string) */
export type WhatsappAccountRow = {
  id: string;
  name: string;
  /** ผู้ใช้ที่บัญชีนี้ผูกอยู่ (ผู้ดูแลระบบเลือก) */
  ownerId: string;
  /** ชื่อเจ้าของ — null = บัญชีของผู้ดูแลที่เปิดหน้าอยู่ */
  ownerName: string | null;
  pairingPhone: string | null;
  enabled: boolean;
  status: WhatsappStatusValue;
  phone: string | null;
  waName: string | null;
  lastError: string | null;
  /** บอทยังดูแลบัญชีนี้อยู่ไหม (แตะ seenAt ภายใน WORKER_STALE_MS) */
  workerOnline: boolean;
  groupCount: number;
  readingCount: number;
  createdAt: string;
};

/** ผู้ใช้ที่ผู้ดูแลเลือกผูกบัญชี WhatsApp ได้ (ผู้ใช้ที่ยังใช้งานอยู่) */
export type WhatsappOwnerOption = { id: string; label: string };

/** คอลัมน์ที่ยอมให้เรียงได้ — ชื่อต้องตรงกับ field ใน Prisma */
export const WHATSAPP_SORTABLE = ["name", "status", "createdAt"] as const;

/** บอทแตะ seenAt ทุกไม่กี่วินาที — เงียบนานกว่านี้ถือว่าบอทไม่ได้รัน */
export const WORKER_STALE_MS = 30_000;

export const isWorkerOnline = (seenAt: Date | null) => !!seenAt && Date.now() - seenAt.getTime() < WORKER_STALE_MS;

/** สถานะ -> คีย์ i18n */
export const statusKey: Record<WhatsappStatusValue, string> = {
  STARTING: "whatsapp.statusSTARTING",
  QR: "whatsapp.statusQR",
  CONNECTED: "whatsapp.statusCONNECTED",
  DISCONNECTED: "whatsapp.statusDISCONNECTED",
  LOGGED_OUT: "whatsapp.statusLOGGED_OUT",
};

export const statusVariant = {
  STARTING: "secondary",
  QR: "warning",
  CONNECTED: "success",
  DISCONNECTED: "outline",
  LOGGED_OUT: "outline",
} as const;
