"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { createAction } from "@/lib/action";
import { logAudit, logAuditMany } from "@/lib/audit";
import { requireDealerId } from "@/lottery/dealer";
import { rereadTickets, rulesOf } from "@/lottery/ingest";
import { READ_RULES_MAX } from "@/lottery/read-rules";
import {
  createReadRuleSchema,
  createReadRulesSchema,
  deleteReadRuleSchema,
  deleteReadRulesSchema,
  setReadRulesActiveSchema,
  updateReadRuleSchema,
  type ReadRuleInput,
} from "@/lib/validations/read-rule";

/**
 * เงื่อนไขอ่านโพยเป็นของแม่หวยที่เลือกอยู่ — ลูกค้าของแต่ละแม่หวยพิมพ์ต่างกัน
 * เงื่อนไขเปลี่ยน → อ่านโพยในงวดที่เปิดรับใหม่ทันที (rereadTickets) ให้เงื่อนไขใช้กับโพยที่รับมาแล้วด้วย
 * ทุก action คืน reread = จำนวนโพยที่ผลการอ่านเปลี่ยน ให้หน้าจอแจ้งผู้ใช้
 */

/** ป้ายใน audit log เช่น "PATTERN · ລ {N} x{A} → {N}={A}ລ່າງ" */
const summaryOf = (rule: { kind: string; find: string; replace: string }) =>
  [rule.kind, rule.kind === "SKIP" ? rule.find : `${rule.find} → ${rule.replace}`].join(" · ").slice(0, 120);

/** เงื่อนไขข้ามบรรทัดไม่ใช้ผลลัพธ์ — เก็บว่างไว้ ไม่ให้ค่าค้างจากตอนเลือกชนิดอื่นมีผล */
const dataOf = (input: ReadRuleInput) => ({
  kind: input.kind,
  find: input.find.trim(),
  replace: input.kind === "SKIP" ? "" : input.replace.trim(),
  note: input.note?.trim() || null,
  isActive: input.isActive,
});

/** เงื่อนไขมีผลกับการอ่านโพย → ยอดในรายงานและ dashboard เปลี่ยนได้ */
function revalidateReadRules() {
  for (const path of ["/read-rules", "/tickets", "/reports", "/dashboard"]) revalidatePath(path);
}

export const createReadRule = createAction(
  createReadRuleSchema,
  async (input) => {
    const user = await requireUser();
    const dealerId = await requireDealerId(user.id);
    const previous = await rulesOf(prisma, dealerId);

    const rule = await prisma.$transaction(async (tx) => {
      const count = await tx.readRule.count({ where: { dealerId } });
      if (count >= READ_RULES_MAX) throw new Error("readRules.tooMany");

      const rule = await tx.readRule.create({ data: { ...dataOf(input), dealerId } });

      await logAudit(tx, {
        action: "CREATE",
        entity: "ReadRule",
        entityId: rule.id,
        summary: summaryOf(rule),
        after: rule,
        user,
      });

      return rule;
    });

    const reread = await rereadTickets(prisma, dealerId, previous, await rulesOf(prisma, dealerId));
    revalidateReadRules();
    return { id: rule.id, reread };
  },
  { successMessage: "readRules.created" },
);

/** เพิ่มหลายเงื่อนไขในคำสั่งเดียว — สร้างตามลำดับแถว (ลำดับมีผลกับการอ่าน) และอ่านโพยใหม่ครั้งเดียว */
export const createReadRules = createAction(
  createReadRulesSchema,
  async ({ rules: inputs }) => {
    const user = await requireUser();
    const dealerId = await requireDealerId(user.id);
    const previous = await rulesOf(prisma, dealerId);

    const ids = await prisma.$transaction(async (tx) => {
      const count = await tx.readRule.count({ where: { dealerId } });
      if (count + inputs.length > READ_RULES_MAX) throw new Error("readRules.tooMany");

      const rules = [];
      // ทีละแถว (ไม่ใช้ createMany) ให้ createdAt เรียงตามแถวที่กรอก
      for (const input of inputs) rules.push(await tx.readRule.create({ data: { ...dataOf(input), dealerId } }));

      await logAuditMany(
        tx,
        rules.map((rule) => ({
          action: "CREATE" as const,
          entity: "ReadRule",
          entityId: rule.id,
          summary: summaryOf(rule),
          after: rule,
          user,
        })),
      );

      return rules.map((rule) => rule.id);
    });

    const reread = await rereadTickets(prisma, dealerId, previous, await rulesOf(prisma, dealerId));
    revalidateReadRules();
    return { ids, count: ids.length, reread };
  },
  { successMessage: "readRules.createdMany" },
);

export const updateReadRule = createAction(
  updateReadRuleSchema,
  async ({ id, ...input }) => {
    const user = await requireUser();
    const dealerId = await requireDealerId(user.id);
    const previous = await rulesOf(prisma, dealerId);

    const rule = await prisma.$transaction(async (tx) => {
      const before = await tx.readRule.findFirst({ where: { id, dealerId } });
      if (!before) throw new Error("readRules.notFound");

      const rule = await tx.readRule.update({ where: { id }, data: dataOf(input) });

      await logAudit(tx, {
        action: "UPDATE",
        entity: "ReadRule",
        entityId: rule.id,
        summary: summaryOf(rule),
        before,
        after: rule,
        user,
      });

      return rule;
    });

    const reread = await rereadTickets(prisma, dealerId, previous, await rulesOf(prisma, dealerId));
    revalidateReadRules();
    return { id: rule.id, reread };
  },
  { successMessage: "readRules.updated" },
);

export const deleteReadRule = createAction(
  deleteReadRuleSchema,
  async ({ id }) => {
    const user = await requireUser();
    const dealerId = await requireDealerId(user.id);
    const previous = await rulesOf(prisma, dealerId);

    await prisma.$transaction(async (tx) => {
      const owned = await tx.readRule.findFirst({ where: { id, dealerId }, select: { id: true } });
      if (!owned) throw new Error("readRules.notFound");

      const before = await tx.readRule.delete({ where: { id } });

      await logAudit(tx, {
        action: "DELETE",
        entity: "ReadRule",
        entityId: before.id,
        summary: summaryOf(before),
        before,
        user,
      });
    });

    const reread = await rereadTickets(prisma, dealerId, previous, await rulesOf(prisma, dealerId));
    revalidateReadRules();
    return { id, reread };
  },
  { successMessage: "readRules.deleted" },
);

/** เปิด/ปิดรายการที่เลือกจากตาราง (checkbox) ในคำสั่งเดียว — แตะเฉพาะข้อที่สถานะเปลี่ยนจริง */
export const setReadRulesActive = createAction(
  setReadRulesActiveSchema,
  async ({ ids, isActive }) => {
    const user = await requireUser();
    const dealerId = await requireDealerId(user.id);
    const previous = await rulesOf(prisma, dealerId);

    const count = await prisma.$transaction(async (tx) => {
      const rules = await tx.readRule.findMany({ where: { id: { in: ids }, dealerId } });
      const changing = rules.filter((rule) => rule.isActive !== isActive);
      if (changing.length === 0) return 0;

      await tx.readRule.updateMany({ where: { id: { in: changing.map((rule) => rule.id) } }, data: { isActive } });

      await logAuditMany(
        tx,
        changing.map((rule) => ({
          action: "UPDATE" as const,
          entity: "ReadRule",
          entityId: rule.id,
          summary: summaryOf(rule),
          before: rule,
          after: { ...rule, isActive },
          user,
        })),
      );

      return changing.length;
    });

    const reread = count > 0 ? await rereadTickets(prisma, dealerId, previous, await rulesOf(prisma, dealerId)) : 0;
    revalidateReadRules();
    return { count, reread };
  },
  { successMessage: "readRules.updatedMany" },
);

/** ลบรายการที่เลือกจากตาราง (checkbox) ในคำสั่งเดียว — audit หนึ่งแถวต่อเงื่อนไขหนึ่งข้อ */
export const deleteReadRules = createAction(
  deleteReadRulesSchema,
  async ({ ids }) => {
    const user = await requireUser();
    const dealerId = await requireDealerId(user.id);
    const previous = await rulesOf(prisma, dealerId);

    const count = await prisma.$transaction(async (tx) => {
      const rules = await tx.readRule.findMany({ where: { id: { in: ids }, dealerId } });
      if (rules.length === 0) return 0;

      await tx.readRule.deleteMany({ where: { id: { in: rules.map((rule) => rule.id) } } });

      await logAuditMany(
        tx,
        rules.map((rule) => ({
          action: "DELETE" as const,
          entity: "ReadRule",
          entityId: rule.id,
          summary: summaryOf(rule),
          before: rule,
          user,
        })),
      );

      return rules.length;
    });

    const reread = count > 0 ? await rereadTickets(prisma, dealerId, previous, await rulesOf(prisma, dealerId)) : 0;
    revalidateReadRules();
    return { count, reread };
  },
  { successMessage: "readRules.deletedMany" },
);
