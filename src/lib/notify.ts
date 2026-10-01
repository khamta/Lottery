"use client";

import { toast } from "sonner";

import type { ActionResult } from "@/lib/action";
import { t } from "@/i18n/translate";

/** ศูนย์รวมการแจ้งเตือน — เปลี่ยนสไตล์ alert ทั้งระบบได้จากไฟล์เดียว */
export const notify = {
  success: (message: string, description?: string) => toast.success(message, { description }),
  error: (message: string, description?: string) => toast.error(message, { description }),
  info: (message: string, description?: string) => toast.info(message, { description }),
  warning: (message: string, description?: string) => toast.warning(message, { description }),
  loading: (message: string) => toast.loading(message),
  dismiss: (id?: string | number) => toast.dismiss(id),
};

/**
 * จัดการผลลัพธ์จาก server action ให้จบในบรรทัดเดียว
 * รับได้ทั้ง "คีย์ i18n" และข้อความตรง ๆ (t() จะคืนค่าเดิมถ้าไม่ใช่คีย์)
 *
 *   const res = await createProduct(values)
 *   if (!handleResult(res)) return
 */
export function handleResult<T>(
  result: ActionResult<T>,
  successMessage?: string,
): result is Extract<ActionResult<T>, { ok: true }> {
  if (result.ok) {
    const message = successMessage ?? result.message;
    if (message) notify.success(t(message));
    return true;
  }

  const firstFieldError = result.fieldErrors
    ? Object.values(result.fieldErrors).flat()[0]
    : undefined;
  notify.error(t(result.message), firstFieldError ? t(firstFieldError) : undefined);
  return false;
}
