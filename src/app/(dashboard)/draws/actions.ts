"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { createAction } from "@/lib/action";
import { logAudit } from "@/lib/audit";
import { isoToDate } from "@/lottery/date";
import { requireDealerId } from "@/lottery/dealer";
import { nextDrawStatus } from "@/lottery/draw-status";
import {
  createDrawSchema,
  deleteDrawSchema,
  setDrawStatusSchema,
  updateDrawSchema,
  type DrawInput,
  type DrawStatusValue,
} from "@/lib/validations/draw";

/**
 * งวดเป็นของแม่หวยที่เลือกอยู่ — เจ้าของแม่หวยแก้ได้ทุกอย่าง แต่แตะงวดของแม่หวยอื่นไม่ได้
 * สถานะคิดจากเลขที่ออก + ปุ่มปิด/เปิดรับในเมนูของแถว · ยังไม่ใช้อัตราจ่าย (รายงานคิดตามยอดแทงจริง)
 */

function toData(input: DrawInput, current: DrawStatusValue | null) {
  const topResult = input.topResult || null;
  const bottomResult = input.bottomResult || null;
  return {
    name: input.name,
    drawDate: isoToDate(input.drawDate),
    status: nextDrawStatus({ topResult, bottomResult }, current),
    topResult,
    bottomResult,
  };
}

/** งวดมีผลกับหน้าโพย รายงาน และ dashboard ด้วย */
function revalidateDraws() {
  for (const path of ["/draws", "/tickets", "/reports", "/dashboard"]) revalidatePath(path);
}

export const createDraw = createAction(
  createDrawSchema,
  async (input) => {
    const user = await requireUser();
    const dealerId = await requireDealerId(user.id);

    const draw = await prisma.$transaction(async (tx) => {
      const draw = await tx.draw.create({ data: { ...toData(input, null), dealerId } });

      await logAudit(tx, {
        action: "CREATE",
        entity: "Draw",
        entityId: draw.id,
        summary: draw.name,
        after: draw,
        user,
      });

      return draw;
    });

    revalidateDraws();
    return { id: draw.id };
  },
  { successMessage: "draws.created" },
);

export const updateDraw = createAction(
  updateDrawSchema,
  async ({ id, ...input }) => {
    const user = await requireUser();
    const dealerId = await requireDealerId(user.id);

    const draw = await prisma.$transaction(async (tx) => {
      const before = await tx.draw.findFirst({ where: { id, dealerId } });
      if (!before) throw new Error("draws.notFound");

      const draw = await tx.draw.update({ where: { id }, data: toData(input, before.status) });

      await logAudit(tx, {
        action: "UPDATE",
        entity: "Draw",
        entityId: draw.id,
        summary: draw.name,
        before,
        after: draw,
        user,
      });

      return draw;
    });

    revalidateDraws();
    return { id: draw.id };
  },
  { successMessage: "draws.updated" },
);

/** ปิดรับ / เปิดรับอีกครั้ง — งวดที่ออกผลแล้วต้องลบเลขที่ออกก่อน */
export const setDrawStatus = createAction(
  setDrawStatusSchema,
  async ({ id, status }) => {
    const user = await requireUser();
    const dealerId = await requireDealerId(user.id);

    const draw = await prisma.$transaction(async (tx) => {
      const before = await tx.draw.findFirst({ where: { id, dealerId } });
      if (!before) throw new Error("draws.notFound");
      if (before.status === "SETTLED") throw new Error("draws.alreadySettled");

      const draw = await tx.draw.update({ where: { id }, data: { status } });

      await logAudit(tx, {
        action: "UPDATE",
        entity: "Draw",
        entityId: draw.id,
        summary: draw.name,
        before,
        after: draw,
        user,
      });

      return draw;
    });

    revalidateDraws();
    return { id: draw.id };
  },
  { successMessage: "draws.statusChanged" },
);

export const deleteDraw = createAction(
  deleteDrawSchema,
  async ({ id }) => {
    const user = await requireUser();
    const dealerId = await requireDealerId(user.id);

    await prisma.$transaction(async (tx) => {
      const draw = await tx.draw.findFirst({ where: { id, dealerId }, select: { id: true } });
      if (!draw) throw new Error("draws.notFound");

      // งวดที่มีโพยแล้วห้ามลบ — ต้องลบโพยเองก่อน กันยอดหายทั้งงวดจากการกดพลาด
      const tickets = await tx.ticket.count({ where: { drawId: id } });
      if (tickets > 0) throw new Error("draws.hasTickets");

      const before = await tx.draw.delete({ where: { id } });

      await logAudit(tx, {
        action: "DELETE",
        entity: "Draw",
        entityId: before.id,
        summary: before.name,
        before,
        user,
      });
    });

    revalidateDraws();
    return { id };
  },
  { successMessage: "draws.deleted" },
);
