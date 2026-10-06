"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { createAction } from "@/lib/action";
import { logAudit } from "@/lib/audit";
import { ownerScope, requireAccess } from "@/lottery/access";
import { ocrModelColumn } from "@/lottery/ai-models";
import { DEALER_COOKIE } from "@/lottery/dealer";
import {
  createDealerSchema,
  deleteDealerSchema,
  selectDealerSchema,
  updateDealerSchema,
  type DealerInput,
} from "@/lib/validations/dealer";

/**
 * แม่หวยเป็นของบัญชีที่สร้าง (ownerId) — ทุก action เช็คเจ้าของซ้ำเสมอ บัญชีอื่นแตะไม่ได้แม้รู้ id
 * ยกเว้นผู้ดูแลระบบที่จัดการแม่หวยของทุกบัญชีได้ (ดู src/lottery/access.ts)
 */

function toData(input: DealerInput) {
  return { name: input.name, note: input.note || null, ocrModel: ocrModelColumn(input.ocrModel) };
}

/** ชื่อแม่หวยอยู่ในตัวเลือกของทุกหน้าระบบหวย */
function revalidateDealers() {
  revalidatePath("/", "layout");
}

export const createDealer = createAction(
  createDealerSchema,
  async (input) => {
    const user = await requireUser();
    await requireAccess(user.id);

    const dealer = await prisma.$transaction(async (tx) => {
      const dealer = await tx.dealer.create({ data: { ...toData(input), ownerId: user.id } });

      await logAudit(tx, {
        action: "CREATE",
        entity: "Dealer",
        entityId: dealer.id,
        summary: dealer.name,
        after: dealer,
        user,
      });

      return dealer;
    });

    revalidateDealers();
    return { id: dealer.id };
  },
  { successMessage: "dealers.created" },
);

export const updateDealer = createAction(
  updateDealerSchema,
  async ({ id, ...input }) => {
    const user = await requireUser();
    const scope = ownerScope(await requireAccess(user.id));

    const dealer = await prisma.$transaction(async (tx) => {
      const before = await tx.dealer.findFirst({ where: { id, ...scope } });
      if (!before) throw new Error("dealers.notFound");

      const dealer = await tx.dealer.update({ where: { id }, data: toData(input) });

      await logAudit(tx, {
        action: "UPDATE",
        entity: "Dealer",
        entityId: dealer.id,
        summary: dealer.name,
        before,
        after: dealer,
        user,
      });

      return dealer;
    });

    revalidateDealers();
    return { id: dealer.id };
  },
  { successMessage: "dealers.updated" },
);

/** ลบได้เฉพาะแม่หวยที่ยังไม่มีงวด — ลูกค้า/เลขอั้นถูกลบตาม กลุ่ม WhatsApp ที่ผูกไว้กลับเป็น "ไม่อ่าน" */
export const deleteDealer = createAction(
  deleteDealerSchema,
  async ({ id }) => {
    const user = await requireUser();
    const scope = ownerScope(await requireAccess(user.id));

    await prisma.$transaction(async (tx) => {
      const owned = await tx.dealer.findFirst({ where: { id, ...scope }, select: { id: true } });
      if (!owned) throw new Error("dealers.notFound");

      const draws = await tx.draw.count({ where: { dealerId: id } });
      if (draws > 0) throw new Error("dealers.hasDraws");

      const before = await tx.dealer.delete({ where: { id } });

      await logAudit(tx, {
        action: "DELETE",
        entity: "Dealer",
        entityId: before.id,
        summary: before.name,
        before,
        user,
      });
    });

    revalidateDealers();
    return { id };
  },
  { successMessage: "dealers.deleted" },
);

/** สลับแม่หวยที่ทำงานอยู่ — เก็บใน cookie ของเบราว์เซอร์นี้ (ไม่เขียนฐานข้อมูล จึงไม่มี audit log) */
export const selectDealer = createAction(selectDealerSchema, async ({ id }) => {
  const user = await requireUser();
  const scope = ownerScope(await requireAccess(user.id));

  const dealer = await prisma.dealer.findFirst({ where: { id, ...scope }, select: { id: true } });
  if (!dealer) throw new Error("dealers.notFound");

  (await cookies()).set(DEALER_COOKIE, dealer.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidateDealers();
  return { id: dealer.id };
});
