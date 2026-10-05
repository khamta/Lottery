"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { createAction } from "@/lib/action";
import { logAudit } from "@/lib/audit";
import { requireAdminAccess } from "@/lottery/access";
import {
  assignWhatsappGroupSchema,
  createWhatsappAccountSchema,
  deleteWhatsappAccountSchema,
  updateWhatsappAccountSchema,
  whatsappCommandSchema,
  type WhatsappAccountInput,
} from "@/lib/validations/whatsapp-account";

/**
 * บัญชี WhatsApp ของบอท — เว็บเขียนเฉพาะ "สิ่งที่ต้องการ" (enabled / command / การผูกกลุ่ม)
 * บอท (worker/whatsapp.ts) อ่านทุกไม่กี่วินาทีแล้วทำตาม และรายงานสถานะ/QR/รายชื่อกลุ่มกลับมาเอง
 *
 * จัดการได้เฉพาะผู้ดูแลระบบ (เช็คทั้ง role ใน session และในฐานข้อมูล) — ผู้ดูแลเลือกว่าบัญชีผูกกับผู้ใช้คนไหน (ownerId)
 * แล้วกลุ่มของบัญชีอ่านโพยเข้าได้เฉพาะแม่หวยของผู้ใช้คนนั้น
 */

/** ฟิลด์ที่ปลอดภัยสำหรับ audit log — ไม่ส่ง QR / รหัสจับคู่ (ใช้เชื่อมบัญชีได้) */
const auditView = (account: {
  name: string;
  ownerId: string;
  pairingPhone: string | null;
  enabled: boolean;
  command: string | null;
}) => ({
  name: account.name,
  ownerId: account.ownerId,
  pairingPhone: account.pairingPhone,
  enabled: account.enabled,
  command: account.command,
});

function toData(input: WhatsappAccountInput) {
  return { name: input.name, ownerId: input.ownerId, pairingPhone: input.pairingPhone || null };
}

function revalidateWhatsapp(id?: string) {
  revalidatePath("/whatsapp");
  if (id) revalidatePath(`/whatsapp/${id}`);
  revalidatePath("/dealers");
  revalidatePath("/members");
}

async function findAccount(tx: Prisma.TransactionClient, id: string) {
  const account = await tx.whatsappAccount.findFirst({ where: { id } });
  if (!account) throw new Error("whatsapp.notFound");
  return account;
}

/** ผูกได้เฉพาะผู้ใช้ที่ยังใช้งานอยู่ */
async function assertOwner(tx: Prisma.TransactionClient, ownerId: string) {
  const owner = await tx.user.findFirst({ where: { id: ownerId, isActive: true }, select: { id: true } });
  if (!owner) throw new Error("whatsapp.ownerNotFound");
}

/** สร้างแล้วบอทเริ่มเชื่อมต่อทันที → หน้าบัญชีขึ้น QR ให้สแกน */
export const createWhatsappAccount = createAction(
  createWhatsappAccountSchema,
  async (input) => {
    const user = await requireRole(["ADMIN"]);
    await requireAdminAccess(user.id);

    const account = await prisma.$transaction(async (tx) => {
      await assertOwner(tx, input.ownerId);
      const account = await tx.whatsappAccount.create({ data: toData(input) });

      await logAudit(tx, {
        action: "CREATE",
        entity: "WhatsappAccount",
        entityId: account.id,
        summary: account.name,
        after: auditView(account),
        user,
      });

      return account;
    });

    revalidateWhatsapp();
    return { id: account.id };
  },
  { successMessage: "whatsapp.created" },
);

/**
 * เปลี่ยนเจ้าของ = ย้ายบัญชีไปให้ผู้ใช้อีกคน — กลุ่มที่เคยผูกกับแม่หวยของเจ้าของเดิมกลับเป็น "ไม่อ่าน"
 * (ไม่อย่างนั้นโพยจะไหลเข้าแม่หวยของคนที่ไม่ได้เป็นเจ้าของบัญชีแล้ว) ต้องเลือกแม่หวยของเจ้าของใหม่อีกครั้ง
 */
export const updateWhatsappAccount = createAction(
  updateWhatsappAccountSchema,
  async ({ id, ...input }) => {
    const user = await requireRole(["ADMIN"]);
    await requireAdminAccess(user.id);

    const account = await prisma.$transaction(async (tx) => {
      const before = await findAccount(tx, id);
      const ownerChanged = before.ownerId !== input.ownerId;

      if (ownerChanged) {
        await assertOwner(tx, input.ownerId);
        await tx.whatsappGroup.updateMany({
          where: { accountId: id, dealerId: { not: null } },
          data: { dealerId: null },
        });
      }
      const account = await tx.whatsappAccount.update({ where: { id }, data: toData(input) });

      await logAudit(tx, {
        action: "UPDATE",
        entity: "WhatsappAccount",
        entityId: account.id,
        summary: account.name,
        before: auditView(before),
        after: auditView(account),
        user,
      });

      return account;
    });

    revalidateWhatsapp(id);
    return { id: account.id };
  },
  { successMessage: "whatsapp.updated" },
);

/** ลบบัญชี — บอทเห็นแล้วเลิกเชื่อมต่อเบอร์นี้ (logout) และลบ session ให้เอง · โพยเดิมไม่หาย */
export const deleteWhatsappAccount = createAction(
  deleteWhatsappAccountSchema,
  async ({ id }) => {
    const user = await requireRole(["ADMIN"]);
    await requireAdminAccess(user.id);

    await prisma.$transaction(async (tx) => {
      await findAccount(tx, id);
      const before = await tx.whatsappAccount.delete({ where: { id } });

      await logAudit(tx, {
        action: "DELETE",
        entity: "WhatsappAccount",
        entityId: before.id,
        summary: before.name,
        before: auditView(before),
        user,
      });
    });

    revalidateWhatsapp();
    return { id };
  },
  { successMessage: "whatsapp.deleted" },
);

/** connect = เริ่มเชื่อมต่อ/ขอ QR ใหม่ · logout = เลิกเชื่อมต่อเบอร์นี้ · sync = อ่านรายชื่อกลุ่มใหม่ */
export const sendWhatsappCommand = createAction(
  whatsappCommandSchema,
  async ({ id, command }) => {
    const user = await requireRole(["ADMIN"]);
    await requireAdminAccess(user.id);

    await prisma.$transaction(async (tx) => {
      const before = await findAccount(tx, id);
      const data =
        command === "connect"
          ? { enabled: true, command: null, lastError: null }
          : { command: command === "logout" ? "LOGOUT" : "SYNC" };
      const account = await tx.whatsappAccount.update({ where: { id }, data });

      await logAudit(tx, {
        action: "UPDATE",
        entity: "WhatsappAccount",
        entityId: account.id,
        summary: `${account.name} · ${command}`,
        before: auditView(before),
        after: auditView(account),
        user,
      });
    });

    revalidateWhatsapp(id);
    return { id };
  },
  { successMessage: "whatsapp.commandSent" },
);

/**
 * เลือกว่ากลุ่มนี้อ่านโพยเข้าแม่หวยไหน (null = ไม่อ่าน) — บอทใช้ค่าใหม่ภายในไม่กี่วินาที
 * แม่หวยต้องเป็นของผู้ใช้ที่บัญชี WhatsApp ผูกอยู่เสมอ (ผู้ดูแลผูกกับแม่หวยของตัวเองไม่ได้ ถ้าบัญชีไม่ได้เป็นของตัวเอง)
 */
export const assignWhatsappGroup = createAction(
  assignWhatsappGroupSchema,
  async ({ id, dealerId, lottery, imageReader }) => {
    const user = await requireRole(["ADMIN"]);
    await requireAdminAccess(user.id);

    const group = await prisma.$transaction(async (tx) => {
      const before = await tx.whatsappGroup.findFirst({
        where: { id },
        include: { account: { select: { ownerId: true } } },
      });
      if (!before) throw new Error("whatsapp.groupNotFound");

      if (dealerId) {
        const dealer = await tx.dealer.findFirst({
          where: { id: dealerId, ownerId: before.account.ownerId },
          select: { id: true },
        });
        if (!dealer) throw new Error("dealers.notFound");
      }

      const group = await tx.whatsappGroup.update({
        where: { id },
        data: { dealerId, ...(lottery ? { lottery } : {}), ...(imageReader ? { imageReader } : {}) },
      });

      await logAudit(tx, {
        action: "UPDATE",
        entity: "WhatsappGroup",
        entityId: group.id,
        summary: group.name,
        before: { dealerId: before.dealerId, lottery: before.lottery, imageReader: before.imageReader },
        after: { dealerId: group.dealerId, lottery: group.lottery, imageReader: group.imageReader },
        user,
      });

      return group;
    });

    revalidateWhatsapp(group.accountId);
    return { id: group.id };
  },
  { successMessage: "whatsapp.groupAssigned" },
);
