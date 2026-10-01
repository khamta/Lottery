"use server";

import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { createAction } from "@/lib/action";
import { logAudit } from "@/lib/audit";
import { registerSchema } from "@/lib/validations/auth";

export const registerUser = createAction(
  registerSchema,
  async ({ name, email, password }) => {
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) throw new Error("auth.emailTaken"); // คีย์ i18n — client เป็นคนแปล

    const user = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name, email, password: await bcrypt.hash(password, 10) },
      });

      // สมัครสมาชิกใหม่ — ผู้ใช้ที่เพิ่งสร้างเป็น actor ของตัวเอง
      await logAudit(tx, {
        action: "CREATE",
        entity: "User",
        entityId: user.id,
        summary: user.name ?? user.email,
        after: user,
        user,
      });

      return user;
    });

    return { id: user.id, email: user.email };
  },
  { successMessage: "auth.registerSuccess" },
);
