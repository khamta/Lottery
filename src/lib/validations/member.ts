import { z } from "zod";

import { nameRule, passwordRule } from "@/lib/validations/auth";

/**
 * จัดการบัญชีผู้ใช้ (เฉพาะผู้ดูแลระบบ) — ข้อความ error เป็นคีย์ i18n
 * กฎชื่อ/รหัสผ่านใช้ชุดเดียวกับหน้าสมัครและหน้าโปรไฟล์ (validations/auth.ts)
 */
export const memberRoleEnum = z.enum(["ADMIN", "USER"]);

const memberFields = {
  name: nameRule,
  email: z.string().trim().toLowerCase().email("validation.emailInvalid"),
  role: memberRoleEnum,
  isActive: z.boolean(),
};

const passwordsMatch = (data: { password: string; confirmPassword: string }) =>
  data.password === data.confirmPassword;
const mismatch = { message: "validation.passwordMismatch", path: ["confirmPassword"] };

/** ฟอร์มแก้ไขบัญชี (ไม่มีรหัสผ่าน — ตั้งรหัสใหม่ใช้ resetMemberPasswordSchema) */
export const memberSchema = z.object(memberFields);

/** ฟอร์ม + action เพิ่มบัญชี — ผู้ดูแลตั้งรหัสผ่านแรกให้ */
export const createMemberSchema = z
  .object({ ...memberFields, password: passwordRule, confirmPassword: z.string() })
  .refine(passwordsMatch, mismatch);

export const updateMemberSchema = memberSchema.extend({ id: z.string().min(1, "validation.required") });

/** ฟอร์มตั้งรหัสผ่านใหม่ (ไม่ต้องรู้รหัสเดิม) */
export const memberPasswordSchema = z
  .object({ password: passwordRule, confirmPassword: z.string() })
  .refine(passwordsMatch, mismatch);

export const resetMemberPasswordSchema = z
  .object({ id: z.string().min(1, "validation.required"), password: passwordRule, confirmPassword: z.string() })
  .refine(passwordsMatch, mismatch);

/** เปิด/ปิดใช้งานจากเมนูของแถว */
export const setMemberActiveSchema = z.object({ id: z.string().min(1, "validation.required"), isActive: z.boolean() });

export const deleteMemberSchema = z.object({ id: z.string().min(1, "validation.required") });

export type MemberInput = z.infer<typeof memberSchema>;
export type CreateMemberInput = z.infer<typeof createMemberSchema>;
export type MemberPasswordInput = z.infer<typeof memberPasswordSchema>;
export type MemberRoleValue = z.infer<typeof memberRoleEnum>;
