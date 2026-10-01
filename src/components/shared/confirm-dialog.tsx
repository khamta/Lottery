"use client";

import * as React from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { beginMutation } from "@/components/shared/mutation-overlay";
import { useI18n } from "@/i18n/client";

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
  onConfirm: () => Promise<void> | void;
};

/** กล่องยืนยันกลาง — ใช้ซ้ำได้ทุกที่ที่ต้องยืนยันก่อนทำรายการ */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  cancelText,
  variant = "destructive",
  onConfirm,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  const [loading, setLoading] = React.useState(false);

  async function handleConfirm() {
    let endOverlay: (() => void) | undefined;
    try {
      setLoading(true);
      const result = onConfirm();
      // onConfirm แบบ async (ไม่ได้ผ่าน mutate()) → ใช้ม่านโหลดเต็มจอกลางแทน spinner ในปุ่ม
      // ถ้าเรียก mutate() (sync) ม่านจะถูกเปิดโดย useOptimisticList อยู่แล้ว
      if (result instanceof Promise) {
        endOverlay = beginMutation("common.processing");
        await result;
      }
      onOpenChange(false);
    } finally {
      endOverlay?.();
      setLoading(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{cancelText ?? t("common.cancel")}</AlertDialogCancel>
          {/* ไม่มี spinner ในปุ่ม — แค่ปิดปุ่มกันกดซ้ำ ม่านโหลดเต็มจอบอกสถานะแทน */}
          <Button variant={variant} disabled={loading} onClick={handleConfirm}>
            {confirmText ?? t("common.confirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
