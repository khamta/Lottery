import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { ACCOUNT_DISABLED_PATH, findAccess, ownerScope, requireAccess } from "@/lottery/access";

/**
 * แม่หวยที่กำลังทำงานอยู่ — ทุกหน้าของระบบหวยแสดง/เขียนข้อมูลของแม่หวยนี้เท่านั้น
 *
 *  - ผู้ใช้ 1 บัญชีมีได้หลายแม่หวย และเห็นเฉพาะแม่หวยที่ตัวเองเป็นเจ้าของ (Dealer.ownerId)
 *  - ผู้ดูแลระบบ (ADMIN) เห็นแม่หวยของทุกบัญชี — ของตัวเองขึ้นก่อน ของคนอื่นมีชื่อเจ้าของกำกับ
 *  - แม่หวยที่เลือกจำไว้ใน cookie แต่ทุกครั้งที่อ่านจะเช็คซ้ำว่ายังมีสิทธิ์ (cookie ปลอมไม่มีผล)
 *  - cookie ไม่มี/ไม่ตรง = แม่หวยแรกของผู้ใช้ (ผู้ดูแลที่ไม่มีแม่หวยเอง = แม่หวยแรกของระบบ)
 *
 * server action ต้องเรียก requireUser() เอง แล้วส่ง user.id มาที่ requireDealerId()
 * (เทสต์ convention ตรวจว่าทุก action เรียก requireUser/requireRole ตรง ๆ)
 */
export const DEALER_COOKIE = "dealer";

/** จำนวนแม่หวยสูงสุดในตัวเลือก — เกินนี้ต้องเลือกจากหน้า /dealers */
export const DEALER_OPTIONS_MAX = 100;

/** ownerName = ชื่อเจ้าของ เฉพาะแม่หวยของบัญชีอื่น (ผู้ดูแลระบบเห็น) — ของตัวเองเป็น null */
export type DealerOption = { id: string; name: string; ownerName: string | null };

const optionSelect = {
  id: true,
  name: true,
  ownerId: true,
  owner: { select: { name: true, email: true } },
} as const;

type RawOption = { id: string; name: string; ownerId: string; owner: { name: string | null; email: string } };

async function selectedDealerId() {
  return (await cookies()).get(DEALER_COOKIE)?.value ?? null;
}

/** แม่หวยทั้งหมดที่ผู้ใช้เห็น + แม่หวยที่เลือกอยู่ (null = ยังไม่มีแม่หวย) — ใช้ใน server component */
export async function getDealerContext() {
  const user = await requireUser();
  const access = await findAccess(user.id);
  if (!access) redirect(ACCOUNT_DISABLED_PATH);

  const scope = ownerScope(access);
  const [rows, selected] = await Promise.all([
    prisma.dealer.findMany({
      where: scope,
      orderBy: { createdAt: "asc" },
      take: DEALER_OPTIONS_MAX,
      select: optionSelect,
    }) as Promise<RawOption[]>,
    selectedDealerId(),
  ]);

  // ผู้ดูแลอาจเลือกแม่หวยที่อยู่นอก 100 รายการแรก — ดึงมาเพิ่มให้ตัวเลือกยังแสดงถูก
  if (selected && !rows.some((row) => row.id === selected)) {
    const extra = (await prisma.dealer.findFirst({
      where: { id: selected, ...scope },
      select: optionSelect,
    })) as RawOption | null;
    if (extra) rows.push(extra);
  }

  // ของตัวเองขึ้นก่อนเสมอ (sort คงลำดับเดิมภายในกลุ่ม)
  rows.sort((a, b) => Number(b.ownerId === user.id) - Number(a.ownerId === user.id));

  const dealers: DealerOption[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    ownerName: row.ownerId === user.id ? null : (row.owner.name ?? row.owner.email),
  }));

  const current = dealers.find((dealer) => dealer.id === selected) ?? dealers[0] ?? null;
  return { user, access, dealers, current };
}

/** รหัสแม่หวยที่เลือกอยู่ของผู้ใช้ — ใช้ใน server action (ไม่มีแม่หวย = error ให้ไปสร้างก่อน) */
export async function requireDealerId(userId: string) {
  const access = await requireAccess(userId);
  const scope = ownerScope(access);
  const selected = await selectedDealerId();

  const dealer =
    (selected ? await prisma.dealer.findFirst({ where: { id: selected, ...scope }, select: { id: true } }) : null) ??
    (await prisma.dealer.findFirst({ where: { ownerId: userId }, orderBy: { createdAt: "asc" }, select: { id: true } })) ??
    (access.isAdmin
      ? await prisma.dealer.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } })
      : null);

  if (!dealer) throw new Error("dealers.required");
  return dealer.id;
}
