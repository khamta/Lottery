"use client";

import * as React from "react";
import { Camera, Check, Download, ImageUp, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserAvatar } from "@/components/shared/user-avatar";
import { downloadImage } from "@/lib/image";
import { useI18n } from "@/i18n/client";

/** ดูรูปโปรไฟล์ปัจจุบันแบบเต็มขนาด (แตะที่รูปในการ์ดโปรไฟล์) */
export function AvatarViewerDialog({
  src,
  name,
  open,
  onOpenChange,
  onChange,
  onRemove,
}: {
  src: string | null;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: () => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const [downloading, setDownloading] = React.useState(false);
  // ชื่อไฟล์จากชื่อผู้ใช้ (ตัดอักขระที่ใช้ในชื่อไฟล์ไม่ได้ออก)
  const fileName = `profile-${name.replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "") || "photo"}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("profile.viewPhoto")}</DialogTitle>
          <DialogDescription className="truncate">{name}</DialogDescription>
        </DialogHeader>

        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL / route ภายใน ไม่ต้องผ่าน next/image
          <img
            src={src}
            alt={name}
            className="mx-auto aspect-square w-full max-w-[min(100%,60vh)] rounded-xl border bg-muted object-cover"
          />
        ) : null}

        <DialogFooter className="sm:justify-between">
          <Button
            variant="outline"
            className="text-destructive"
            onClick={() => {
              onOpenChange(false);
              onRemove();
            }}
          >
            <Trash2 /> {t("profile.removePhoto")}
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              disabled={!src || downloading}
              onClick={async () => {
                if (!src) return;
                setDownloading(true);
                try {
                  await downloadImage(src, fileName);
                } finally {
                  setDownloading(false);
                }
              }}
            >
              <Download /> {t("profile.downloadPhoto")}
            </Button>
            <Button
              onClick={() => {
                onOpenChange(false);
                onChange();
              }}
            >
              <Camera /> {t("profile.changePhoto")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * ตัวอย่างรูปใหม่ก่อนบันทึก — แสดงทั้งแบบเต็มและแบบวงกลมขนาดที่ใช้จริงในระบบ
 * ยังไม่แตะฐานข้อมูลจนกว่าจะกด "ใช้รูปนี้"
 */
export function AvatarPreviewDialog({
  src,
  name,
  email,
  onConfirm,
  onChooseAnother,
  onCancel,
}: {
  src: string | null;
  name: string | null;
  email: string;
  onConfirm: () => void;
  onChooseAnother: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();

  return (
    <Dialog open={!!src} onOpenChange={(open) => (open ? undefined : onCancel())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("profile.previewTitle")}</DialogTitle>
          <DialogDescription>{t("profile.previewDesc")}</DialogDescription>
        </DialogHeader>

        {src ? (
          // จอเล็ก: รูปเต็มอยู่บน แถบวงกลมอยู่ล่าง · จอ sm ขึ้นไป: วางข้างกันเพื่อไม่ให้ dialog สูงเกินจอ
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL ที่ย่อแล้วฝั่ง client */}
            <img
              src={src}
              alt=""
              className="mx-auto aspect-square w-full max-w-[min(100%,50vh)] rounded-xl border bg-muted object-cover"
            />
            <div className="flex items-end justify-center gap-4 rounded-xl border bg-muted/40 p-4 sm:flex-col sm:items-center sm:justify-center">
              <UserAvatar name={name} email={email} image={src} className="size-20 border-2 border-card" />
              <UserAvatar name={name} email={email} image={src} className="size-12" />
              <UserAvatar name={name} email={email} image={src} className="size-8" />
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onChooseAnother}>
            <ImageUp /> {t("profile.chooseAnother")}
          </Button>
          <Button onClick={onConfirm}>
            <Check /> {t("profile.usePhoto")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
