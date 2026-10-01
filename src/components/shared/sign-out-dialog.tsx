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
      onConfirm={() => signOut({ callbackUrl: "/login" })}
    />
  );
}
