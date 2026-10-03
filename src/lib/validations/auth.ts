import { z } from "zod";

/**
 * ข้อความ error ทั้งหมดเก็บเป็น "คีย์ i18n" (validation.*)
 * เพราะ schema ตัวเดียวกันถูกใช้ทั้งฝั่ง server (ที่ไม่รู้ภาษาของผู้ใช้) และฝั่ง client
 * ตัวแปลอยู่ที่ FormMessage / handleResult
 */
/** เข้าสู่ระบบด้วยอีเมลหรือชื่อผู้ใช้ก็ได้ — มี "@" = อีเมล ไม่มี = username (ดู src/lib/auth.ts) */
export const loginSchema = z.object({
  identifier: z.string().trim().toLowerCase().min(1, "account.identifierRequired"),
  password: z.string().min(1, "validation.passwordRequired"),
});

/** ชื่อผู้ใช้: 3–30 ตัว a-z 0-9 . _ - เก็บเป็นตัวเล็กเสมอ (ห้ามมี "@" เพื่อแยกจากอีเมลตอน login) */
export const usernameRule = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "account.usernameMin")
  .max(30, "account.usernameMax")
  .regex(/^[a-z0-9._-]+$/, "account.usernameInvalid");

/** กฎรหัสผ่านชุดเดียว — ใช้ทั้งตอนสมัครและตอนเปลี่ยนรหัสผ่านในหน้าโปรไฟล์ */
export const passwordRule = z
  .string()
  .min(8, "validation.passwordMin")
  .regex(/[A-Za-z]/, "validation.passwordLetter")
  .regex(/[0-9]/, "validation.passwordNumber");

export const nameRule = z.string().trim().min(2, "validation.nameMin").max(80, "validation.nameMax");

export const registerSchema = z
  .object({
    name: nameRule,
    email: z.string().email("validation.emailInvalid"),
    password: passwordRule,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "validation.passwordMismatch",
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
