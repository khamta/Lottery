import { z } from "zod";

/**
 * ข้อความ error ทั้งหมดเก็บเป็น "คีย์ i18n" (validation.*)
 * เพราะ schema ตัวเดียวกันถูกใช้ทั้งฝั่ง server (ที่ไม่รู้ภาษาของผู้ใช้) และฝั่ง client
 * ตัวแปลอยู่ที่ FormMessage / handleResult
 */
export const loginSchema = z.object({
  email: z.string().min(1, "validation.emailRequired").email("validation.emailInvalid"),
  password: z.string().min(1, "validation.passwordRequired"),
});

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
