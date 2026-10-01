import { z } from "zod";

import { nameRule, passwordRule } from "@/lib/validations/auth";

/** ข้อความ error เป็นคีย์ i18n (validation.*) — ดูคำอธิบายใน validations/auth.ts */

/** ชนิดไฟล์รูปโปรไฟล์ที่รับ (ฝั่ง client แปลงเป็น webp/jpeg ก่อนส่งอยู่แล้ว) */
export const AVATAR_TYPES = ["image/webp", "image/jpeg", "image/png"] as const;
/** ขนาดด้านละกี่ px หลังย่อฝั่ง client */
export const AVATAR_SIZE = 512;
/** จำกัดความยาว data URL (~300 KB) — รูป 512×512 แบบ webp มักไม่เกิน 80 KB */
export const AVATAR_MAX_LENGTH = 400_000;

export const AVATAR_DATA_URL = /^data:(image\/(?:webp|jpeg|png));base64,[A-Za-z0-9+/]+=*$/;

export const updateProfileSchema = z.object({
  name: nameRule,
});

export const updateAvatarSchema = z.object({
  image: z
    .string()
    .max(AVATAR_MAX_LENGTH, "validation.imageTooLarge")
    .regex(AVATAR_DATA_URL, "validation.imageInvalid"),
});

export const removeAvatarSchema = z.object({});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "validation.passwordRequired"),
    newPassword: passwordRule,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "validation.passwordMismatch",
    path: ["confirmPassword"],
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
