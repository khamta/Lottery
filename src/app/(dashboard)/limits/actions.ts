"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { createAction } from "@/lib/action";
import { logAudit, logAuditMany } from "@/lib/audit";
import { requireDealerId } from "@/lottery/dealer";
import {
  createLimitSchema,
  deleteLimitSchema,
  deleteLimitsSchema,
  updateLimitSchema,
} from "@/lib/validations/limit";

/** เพดานอั้นเป็นของแม่หวยที่เลือกอยู่ — แต่ละแม่หวยรับความเสี่ยงของตัวเอง */

type LimitRecord = { digits: number; number: string; position: string; currency: string };

/** ป้ายใน audit log เช่น "2 · 32 · TOP · LAK" ("*" = ทุกเลข) */
const summaryOf = (limit: LimitRecord) =>
  [limit.digits, limit.number || "*", limit.position, limit.currency].join(" · ");

/** เพดานมีผลกับรายงานเลขเกินอั้นและ dashboard */
function revalidateLimits() {
  for (const path of ["/limits", "/reports", "/dashboard"]) revalidatePath(path);
}

export const createLimit = createAction(
  createLimitSchema,
  async (input) => {
    const user = await requireUser();
    const dealerId = await requireDealerId(user.id);

    const limit = await prisma.$transaction(async (tx) => {
      const limit = await tx.limit.create({ data: { ...input, dealerId } });

      await logAudit(tx, {
        action: "CREATE",
        entity: "Limit",
        entityId: limit.id,
        summary: summaryOf(limit),
        after: limit,
        user,
      });

      return limit;
    });

    revalidateLimits();
    return { id: limit.id };
  },
  { successMessage: "limits.created" },
);

export const updateLimit = createAction(
  updateLimitSchema,
  async ({ id, ...input }) => {
    const user = await requireUser();
    const dealerId = await requireDealerId(user.id);

    const limit = await prisma.$transaction(async (tx) => {
      const before = await tx.limit.findFirst({ where: { id, dealerId } });
      if (!before) throw new Error("limits.notFound");

      const limit = await tx.limit.update({ where: { id }, data: input });

      await logAudit(tx, {
        action: "UPDATE",
        entity: "Limit",
        entityId: limit.id,
        summary: summaryOf(limit),
        before,
        after: limit,
        user,
      });

      return limit;
    });

    revalidateLimits();
    return { id: limit.id };
  },
  { successMessage: "limits.updated" },
);

export const deleteLimit = createAction(
  deleteLimitSchema,
  async ({ id }) => {
    const user = await requireUser();
    const dealerId = await requireDealerId(user.id);

    await prisma.$transaction(async (tx) => {
      const owned = await tx.limit.findFirst({ where: { id, dealerId }, select: { id: true } });
      if (!owned) throw new Error("limits.notFound");

      const before = await tx.limit.delete({ where: { id } });

      await logAudit(tx, {
        action: "DELETE",
        entity: "Limit",
        entityId: before.id,
        summary: summaryOf(before),
        before,
        user,
      });
    });

    revalidateLimits();
    return { id };
  },
  { successMessage: "limits.deleted" },
);

/** ลบรายการที่เลือกจากตาราง (checkbox) ในคำสั่งเดียว — audit หนึ่งแถวต่อเพดานหนึ่งรายการ */
export const deleteLimits = createAction(
  deleteLimitsSchema,
  async ({ ids }) => {
    const user = await requireUser();
    const dealerId = await requireDealerId(user.id);

    const count = await prisma.$transaction(async (tx) => {
      const limits = await tx.limit.findMany({ where: { id: { in: ids }, dealerId } });
      if (limits.length === 0) return 0;

      await tx.limit.deleteMany({ where: { id: { in: limits.map((limit) => limit.id) } } });

      await logAuditMany(
        tx,
        limits.map((limit) => ({
          action: "DELETE" as const,
          entity: "Limit",
          entityId: limit.id,
          summary: summaryOf(limit),
          before: limit,
          user,
        })),
      );

      return limits.length;
    });

    revalidateLimits();
    return { count };
  },
  { successMessage: "limits.deletedMany" },
);
