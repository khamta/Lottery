"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { createAction } from "@/lib/action";
import { logAudit } from "@/lib/audit";
import { requireAdminAccess } from "@/lottery/access";
import {
  createMemberSchema,
  deleteMemberSchema,
  resetMemberPasswordSchema,
  setMemberActiveSchema,
  updateMemberSchema,
} from "@/lib/validations/member";

/**
 * จัดการบัญชีผู้ใช้ — เฉพาะผู้ดูแลระบบ (เช็คทั้ง role ใน session และในฐานข้อมูล)
 *
 * กันระบบล็อกตัวเอง:
 *  - ห้ามลดสิทธิ์ / ปิดใช้งาน / ลบบัญชีของตัวเอง — ผู้ที่สั่งได้เป็นผู้ดูแลที่ใช้งานอยู่เสมอ
 *    จึงเหลือผู้ดูแลอย่างน้อย 1 บัญชีแน่นอน
 *  - ลบบัญชีที่ยังมีแม่หวยหรือบัญชี WhatsApp ไม่ได้ (ปิดใช้งานแทน — ข้อมูลยังอยู่ครบ)
 *
 * บัญชีที่ถูกปิด/ลดสิทธิ์มีผลทันทีกับทุกหน้าของระบบหวย (src/lottery/access.ts อ่านจากฐานข้อมูล)
 */

/** ฟิลด์ที่บันทึกใน audit log — ไม่ส่ง hash รหัสผ่าน / รูปโปรไฟล์ */
const auditView = (user: {
  name: string | null;
  username: string | null;
  email: string;
  role: string;
  isActive: boolean;
}) => ({
  name: user.name,
  username: user.username,
  email: user.email,
  role: user.role,
  isActive: user.isActive,
});

function revalidateMembers() {
  revalidatePath("/members");
  revalidatePath("/users");
}

async function assertEmailFree(tx: Prisma.TransactionClient, email: string, exceptId?: string) {
  const taken = await tx.user.findUnique({ where: { email }, select: { id: true } });
  if (taken && taken.id !== exceptId) throw new Error("auth.emailTaken");
}

async function assertUsernameFree(tx: Prisma.TransactionClient, username: string, exceptId?: string) {
  const taken = await tx.user.findUnique({ where: { username }, select: { id: true } });
  if (taken && taken.id !== exceptId) throw new Error("account.usernameTaken");
}

/** ห้ามลดสิทธิ์/ปิดใช้งานตัวเอง (แก้ชื่อ/อีเมลตัวเองได้) */
function assertNotSelfLock(actorId: string, before: { id: string }, next: { role: string; isActive: boolean }) {
  if (before.id === actorId && (next.role !== "ADMIN" || !next.isActive)) throw new Error("members.selfLock");
}

export const createMember = createAction(
  createMemberSchema,
  async ({ password, confirmPassword: _confirm, ...input }) => {
    const user = await requireRole(["ADMIN"]);
    await requireAdminAccess(user.id);
    const hash = await bcrypt.hash(password, 10);

    const member = await prisma.$transaction(async (tx) => {
      await assertEmailFree(tx, input.email);
      await assertUsernameFree(tx, input.username);
      const member = await tx.user.create({ data: { ...input, password: hash } });

      await logAudit(tx, {
        action: "CREATE",
        entity: "User",
        entityId: member.id,
        summary: member.name ?? member.email,
        after: auditView(member),
        user,
      });

      return member;
    });

    revalidateMembers();
    return { id: member.id };
  },
  { successMessage: "members.created" },
);

export const updateMember = createAction(
  updateMemberSchema,
  async ({ id, ...input }) => {
    const user = await requireRole(["ADMIN"]);
    await requireAdminAccess(user.id);

    const member = await prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id } });
      if (!before) throw new Error("members.notFound");

      assertNotSelfLock(user.id, before, input);
      if (input.email !== before.email) await assertEmailFree(tx, input.email, id);
      if (input.username !== before.username) await assertUsernameFree(tx, input.username, id);

      const member = await tx.user.update({
        where: { id },
        // ปิดใช้งาน = หลุดจากรายชื่อออนไลน์ทันที
        data: { ...input, ...(input.isActive ? {} : { lastSeenAt: null }) },
      });

      await logAudit(tx, {
        action: "UPDATE",
        entity: "User",
        entityId: member.id,
        summary: member.name ?? member.email,
        before: auditView(before),
        after: auditView(member),
        user,
      });

      return member;
    });

    revalidateMembers();
    return { id: member.id };
  },
  { successMessage: "members.updated" },
);

export const setMemberActive = createAction(
  setMemberActiveSchema,
  async ({ id, isActive }) => {
    const user = await requireRole(["ADMIN"]);
    await requireAdminAccess(user.id);

    await prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id } });
      if (!before) throw new Error("members.notFound");

      assertNotSelfLock(user.id, before, { role: before.role, isActive });

      const member = await tx.user.update({
        where: { id },
        data: { isActive, ...(isActive ? {} : { lastSeenAt: null }) },
      });

      await logAudit(tx, {
        action: "UPDATE",
        entity: "User",
        entityId: member.id,
        summary: member.name ?? member.email,
        before: auditView(before),
        after: auditView(member),
        user,
      });
    });

    revalidateMembers();
    return { id };
  },
  { successMessage: "members.updated" },
);

/** ผู้ดูแลตั้งรหัสผ่านใหม่ให้ (ไม่ต้องรู้รหัสเดิม) — ใช้ตอนผู้ใช้ลืมรหัส */
export const resetMemberPassword = createAction(
  resetMemberPasswordSchema,
  async ({ id, password }) => {
    const user = await requireRole(["ADMIN"]);
    await requireAdminAccess(user.id);
    const hash = await bcrypt.hash(password, 10);

    await prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id }, select: { id: true, name: true, email: true } });
      if (!before) throw new Error("members.notFound");

      const member = await tx.user.update({ where: { id }, data: { password: hash } });

      await logAudit(tx, {
        action: "UPDATE",
        entity: "User",
        entityId: member.id,
        summary: member.name ?? member.email,
        before: { password: "old" },
        after: { password: "reset" },
        user,
      });
    });

    return { id };
  },
  { successMessage: "members.passwordReset" },
);

export const deleteMember = createAction(
  deleteMemberSchema,
  async ({ id }) => {
    const user = await requireRole(["ADMIN"]);
    await requireAdminAccess(user.id);
    if (id === user.id) throw new Error("members.selfLock");

    await prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({
        where: { id },
        select: { _count: { select: { dealers: true, whatsappAccounts: true } } },
      });
      if (!target) throw new Error("members.notFound");
      if (target._count.dealers > 0 || target._count.whatsappAccounts > 0) throw new Error("members.hasData");

      const before = await tx.user.delete({ where: { id } });

      await logAudit(tx, {
        action: "DELETE",
        entity: "User",
        entityId: before.id,
        summary: before.name ?? before.email,
        before: auditView(before),
        user,
      });
    });

    revalidateMembers();
    return { id };
  },
  { successMessage: "members.deleted" },
);
