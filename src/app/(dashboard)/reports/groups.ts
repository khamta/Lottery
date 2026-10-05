import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { groupWhere } from "../tickets/groups";
import { ALL_GROUPS, NO_GROUP } from "../tickets/types";
import type { ReportGroupOption } from "./types";

/**
 * กลุ่มของรายงาน (?group=) — รายงานทั้งหน้า (ทุกมุมมอง) และไฟล์ส่งออกคิดเฉพาะโพยของกลุ่มที่เลือกได้
 * ตัวเลือก = กลุ่ม WhatsApp ที่มีโพยในงวดนี้ (เรียงตามชื่อ) + NO_GROUP (คีย์เอง / ไม่รู้กลุ่ม) ถ้ามีโพย
 * จำนวนนับด้วย groupBy ที่ฐานข้อมูล
 */
export async function getReportGroups(drawId: string): Promise<ReportGroupOption[]> {
  const stats = await prisma.ticket.groupBy({ by: ["groupId"], where: { drawId }, _count: { _all: true } });
  const ids = stats.flatMap((stat) => (stat.groupId ? [stat.groupId] : []));
  const groups = ids.length
    ? await prisma.whatsappGroup.findMany({ where: { id: { in: ids } }, orderBy: { name: "asc" }, select: { id: true, name: true } })
    : [];
  const countOf = new Map(stats.map((stat) => [stat.groupId ?? NO_GROUP, stat._count._all]));

  return [
    ...groups.map((group) => ({ key: group.id, name: group.name, bills: countOf.get(group.id) ?? 0 })),
    ...(countOf.has(NO_GROUP) ? [{ key: NO_GROUP, name: null, bills: countOf.get(NO_GROUP)! }] : []),
  ];
}

/** ?group= → กลุ่มที่เลือก (ต้องอยู่ในตัวเลือกของงวดนี้ — กันกลุ่มของแม่หวยอื่น) · null = ทุกกลุ่ม */
export function pickReportGroup(options: ReportGroupOption[], param: string | null | undefined) {
  return (param && options.find((option) => option.key === param)) || null;
}

/**
 * ?group= ของไฟล์ส่งออก → กลุ่ม (ไม่ผูกกับงวดเดียว เพราะใบสรุปรวมหลายงวดของวัน และเลือกวันอื่นได้)
 * รับเฉพาะ NO_GROUP / กลุ่มที่ผูกกับแม่หวยนี้หรือเคยมีโพยของแม่หวยนี้ — กลุ่มของแม่หวยอื่น = null (ทุกกลุ่ม)
 */
export async function findReportGroup(dealerId: string, param: string | null): Promise<ReportGroupOption | null> {
  const key = param?.trim().slice(0, 50);
  if (!key || key === ALL_GROUPS) return null;
  if (key === NO_GROUP) return { key, name: null, bills: 0 };
  const group = await prisma.whatsappGroup.findFirst({
    where: { id: key, OR: [{ dealerId }, { tickets: { some: { draw: { dealerId } } } }] },
    select: { id: true, name: true },
  });
  return group ? { key: group.id, name: group.name, bills: 0 } : null;
}

/** where ของโพยในกลุ่มที่เลือก — undefined = ทั้งงวด */
export function reportGroupWhere(group: ReportGroupOption | null): Prisma.TicketWhereInput | undefined {
  return group ? groupWhere([group.key]) : undefined;
}
