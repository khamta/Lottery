import type { Prisma } from "@prisma/client";

import type { Currency, ParseOptions } from "./parser";

/**
 * ตั้งค่าการอ่านโพยรายกลุ่ม WhatsApp (whatsapp_groups) — ใช้ทุกครั้งที่อ่านข้อความของโพยจากกลุ่มนั้น
 * (บอทอ่านครั้งแรก · อ่านรูป · ลูกค้าแก้ข้อความ · คนแก้โพยในหน้าโพย) เพื่อให้ผลตรงกันทุกทาง
 *  - threeDigitBottom: เลข 3 ตัวแทงล่าง / บนล่างได้
 *  - currency: สกุลเงินเมื่อทั้งโพยไม่ระบุสกุลเงินเลย
 * โพยที่ไม่มีกลุ่ม (คีย์เอง) ใช้ค่าเริ่มต้นของระบบ: 3 ตัวลงบนอย่างเดียว · กีบ
 */
export type GroupReadSettings = { threeDigitBottom: boolean; currency: Currency };

export function groupParseOptions(
  group: GroupReadSettings | null | undefined,
): Pick<ParseOptions, "threeDigitBottom" | "defaultCurrency"> {
  return group ? { threeDigitBottom: group.threeDigitBottom, defaultCurrency: group.currency } : {};
}

export const GROUP_READ_SELECT = { threeDigitBottom: true, currency: true } as const;

/** ตั้งค่าการอ่านของกลุ่ม → ตัวเลือกของตัวแยกข้อความ (ไม่มีกลุ่ม / ไม่พบกลุ่ม = ค่าเริ่มต้น) */
export async function groupReadOf(client: Pick<Prisma.TransactionClient, "whatsappGroup">, groupId: string | null | undefined) {
  if (!groupId) return {};
  const group = await client.whatsappGroup.findUnique({ where: { id: groupId }, select: GROUP_READ_SELECT });
  return groupParseOptions(group);
}
