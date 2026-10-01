"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { createAction } from "@/lib/action";
import { logAudit } from "@/lib/audit";
import { avatarUrl, decodeAvatarDataUrl } from "@/lib/avatar";
import {
  changePasswordSchema,
  removeAvatarSchema,
  updateAvatarSchema,
  updateProfileSchema,
} from "@/lib/validations/profile";

/**
 * แก้ได้เฉพาะบัญชีของตัวเอง (ใช้ id จาก session เสมอ ไม่รับ id จาก client)
 * revalidate ทั้ง layout เพราะชื่อ/รูปแสดงอยู่ที่แถบบนทุกหน้า
 *
 * audit เก็บ entity "User" — เบา ๆ พอ: รูป/รหัสผ่านไม่เก็บค่าจริง (ดู src/lib/audit.ts)
 */

export const updateProfile = createAction(
  updateProfileSchema,
  async ({ name }) => {
    const user = await requireUser();

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { name } });

      await logAudit(tx, {
        action: "UPDATE",
        entity: "User",
        entityId: user.id,
        summary: name,
        before: { name: user.name },
        after: { name },
        user,
      });
    });

    revalidatePath("/", "layout");
    return { name };
  },
  { successMessage: "profile.updated" },
);

export const updateAvatar = createAction(
  updateAvatarSchema,
  async ({ image }) => {
    const user = await requireUser();
    const { type, bytes } = decodeAvatarDataUrl(image);
    const url = avatarUrl(user.id);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { avatar: bytes, avatarType: type, image: url },
      });

      // เก็บแค่ "flag ว่ามีรูปหรือไม่" — ไม่เก็บ bytes จริงของรูป
      await logAudit(tx, {
        action: "UPDATE",
        entity: "User",
        entityId: user.id,
        summary: user.name ?? user.email,
        before: { avatar: false },
        after: { avatar: true },
        user,
      });
    });

    revalidatePath("/", "layout");
    return { image: url };
  },
  { successMessage: "profile.photoUpdated" },
);

export const removeAvatar = createAction(
  removeAvatarSchema,
  async () => {
    const user = await requireUser();

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { avatar: null, avatarType: null, image: null },
      });

      await logAudit(tx, {
        action: "UPDATE",
        entity: "User",
        entityId: user.id,
        summary: user.name ?? user.email,
        before: { avatar: true },
        after: { avatar: false },
        user,
      });
    });

    revalidatePath("/", "layout");
    return { image: null };
  },
  { successMessage: "profile.photoRemoved" },
);

export const changePassword = createAction(
  changePasswordSchema,
  async ({ currentPassword, newPassword }) => {
    const user = await requireUser();

    const record = await prisma.user.findUnique({
      where: { id: user.id },
      select: { password: true },
    });
    if (!record?.password) throw new Error("profile.noPassword");

    const ok = await bcrypt.compare(currentPassword, record.password);
    if (!ok) throw new Error("profile.wrongPassword");

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { password: await bcrypt.hash(newPassword, 10) },
      });

      // ฟิลด์ "password" ถูก redact อัตโนมัติใน diffChanges — เก็บได้แค่ว่าเปลี่ยน ไม่เก็บค่าจริง
      await logAudit(tx, {
        action: "UPDATE",
        entity: "User",
        entityId: user.id,
        summary: user.name ?? user.email,
        before: { password: record.password },
        after: { password: "changed" },
        user,
      });
    });

    return { id: user.id };
  },
  { successMessage: "profile.passwordChanged" },
);
