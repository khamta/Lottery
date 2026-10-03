"use client";

import { signOut } from "next-auth/react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useI18n } from "@/i18n/client";

/** ยืนยันก่อนออกจากระบบ — ทุกปุ่ม "ออกจากระบบ" ต้องเปิดกล่องนี้ ห้ามเรียก signOut() ตรง ๆ */
export function SignOutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("user.signOut")}
      description={t("user.signOutConfirm")}
      confirmText={t("user.signOut")}
      onConfirm={async () => {
        // ไม่ใช้ redirect ของ Auth.js — URL ที่ server ส่งกลับสร้างจาก host ที่ server เห็น
        // (หลัง reverse proxy / docker จะกลายเป็น http://localhost:3010/login)
        // ให้เบราว์เซอร์เปลี่ยนหน้าเองด้วย path สัมพัทธ์ จึงอยู่บนโดเมนจริงที่ผู้ใช้เปิดอยู่เสมอ
        await signOut({ redirect: false });
        window.location.assign("/login");
      }}
    />
  );
}
