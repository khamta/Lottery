"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Camera, ChevronRight, LogOut, Mail, Settings, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { beginProgress } from "@/components/shared/mutation-overlay";
import { SignOutDialog } from "@/components/shared/sign-out-dialog";
import { UserAvatar } from "@/components/shared/user-avatar";
import { handleResult, notify } from "@/lib/notify";
import { resizeImageToDataUrl } from "@/lib/image";
import { formatDate } from "@/lib/utils";
import { AVATAR_SIZE } from "@/lib/validations/profile";
import { useI18n } from "@/i18n/client";
import { removeAvatar, updateAvatar } from "../actions";
import type { ProfileData } from "../types";
import { AvatarPreviewDialog, AvatarViewerDialog } from "./avatar-dialogs";
import { PasswordForm, PersonalInfoForm } from "./profile-forms";

/**
 * หน้าโปรไฟล์ — จอเล็กเรียงเป็นคอลัมน์เดียวแบบหน้า "ฉัน" ของแอป
 * จอใหญ่: การ์ดโปรไฟล์ซ้าย ฟอร์มขวา
 *
 * รูปโปรไฟล์: ย่อฝั่ง client → หน้าต่างตัวอย่างให้ยืนยัน → โชว์รูปใหม่ทันที → บันทึกเบื้องหลัง
 * (ถ้าไม่สำเร็จย้อนกลับเป็นรูปเดิม) · แตะรูปปัจจุบันเพื่อดูแบบเต็มขนาด
 * งานเขียนทั้งหมดในหน้านี้ไม่ได้ผ่าน useOptimisticList จึงเปิดม่านโหลดเอง
 * (อัปโหลดรูปใช้ beginProgress() — ม่านแสดง % และแถบวิ่งจนเต็ม)
 */
export function ProfileView({ profile }: { profile: ProfileData }) {
  const { t, intl } = useI18n();
  const router = useRouter();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [image, setImage] = React.useState(profile.image);
  const [confirmRemove, setConfirmRemove] = React.useState(false);
  const [confirmSignOut, setConfirmSignOut] = React.useState(false);
  const [viewerOpen, setViewerOpen] = React.useState(false);
  /** รูปที่เลือกแล้วแต่ยังไม่บันทึก — มีค่า = เปิดหน้าต่างตัวอย่าง */
  const [pending, setPending] = React.useState<string | null>(null);

  // หลัง router.refresh() server ส่ง URL จริงมา — แทนที่ data URL ชั่วคราว
  React.useEffect(() => setImage(profile.image), [profile.image]);

  const pickFile = () => fileRef.current?.click();

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // เลือกไฟล์เดิมซ้ำได้
    if (!file) return;

    try {
      setPending(await resizeImageToDataUrl(file, AVATAR_SIZE));
    } catch {
      notify.error(t("validation.imageInvalid"));
    }
  }

  async function handleConfirmUpload() {
    const dataUrl = pending;
    if (!dataUrl) return;
    setPending(null);

    const previous = image;
    setImage(dataUrl);
    // server action ไม่มี event ความคืบหน้า — ม่านวิ่ง % เองแล้วเต็ม 100% เมื่อบันทึกเสร็จ
    const upload = beginProgress("common.uploading");
    try {
      const result = await updateAvatar({ image: dataUrl });
      if (!handleResult(result)) {
        setImage(previous);
        return;
      }
      router.refresh();
    } finally {
      upload.end();
    }
  }

  async function handleRemove() {
    const previous = image;
    setImage(null);
    const result = await removeAvatar({});
    if (!handleResult(result)) {
      setImage(previous);
      return;
    }
    router.refresh();
  }

  return (
    <>
      <PageHeader title={t("profile.title")} description={t("profile.subtitle")} className="hidden lg:flex" />

      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        {/* ---------- การ์ดโปรไฟล์ ---------- */}
        <Card className="gap-0 overflow-hidden py-0">
          <div className="h-24 bg-gradient-to-br from-primary/30 via-primary/10 to-transparent" />

          <div className="-mt-12 flex flex-col items-center gap-1 px-6 pb-6 text-center">
            <div className="relative">
              {/* แตะรูป: มีรูป = ดูแบบเต็ม, ไม่มีรูป = เลือกรูปใหม่ */}
              <button
                type="button"
                onClick={() => (image ? setViewerOpen(true) : pickFile())}
                aria-label={image ? t("profile.viewPhoto") : t("profile.changePhoto")}
                title={image ? t("profile.viewPhoto") : t("profile.changePhoto")}
                className="block rounded-full transition-transform focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none active:scale-95"
              >
                <UserAvatar
                  name={profile.name}
                  email={profile.email}
                  image={image}
                  className="size-24 border-4 border-card shadow-md"
                  fallbackClassName="text-2xl"
                />
              </button>
              <button
                type="button"
                onClick={pickFile}
                aria-label={t("profile.changePhoto")}
                title={t("profile.changePhoto")}
                className="absolute right-0 bottom-0 flex size-8 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow transition-transform active:scale-90"
              >
                <Camera className="size-4" />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={handleFile}
              />
            </div>

            <h2 className="mt-2 max-w-full truncate text-lg font-semibold">
              {profile.name ?? t("user.fallbackName")}
            </h2>
            <p className="flex max-w-full items-center gap-1.5 text-sm text-muted-foreground">
              <Mail className="size-3.5 shrink-0" />
              <span className="truncate">{profile.email}</span>
            </p>

            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
              <Badge variant={profile.role === "ADMIN" ? "default" : "secondary"}>{profile.role}</Badge>
              <span className="flex items-center gap-1">
                <CalendarDays className="size-3.5" />
                {t("profile.memberSince")} {formatDate(profile.createdAt, intl, "date")}
              </span>
            </div>

            <div className="mt-4 grid w-full grid-cols-2 gap-2">
              <Button variant="outline" onClick={pickFile} className={image ? "" : "col-span-2"}>
                <Camera /> {t("profile.changePhoto")}
              </Button>
              {image ? (
                <Button variant="outline" onClick={() => setConfirmRemove(true)} className="text-destructive">
                  <Trash2 /> {t("profile.removePhoto")}
                </Button>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("profile.photoHint")}</p>
          </div>
        </Card>

        {/* ---------- ฟอร์ม ---------- */}
        <div className="space-y-4 lg:col-span-2">
          <PersonalInfoForm name={profile.name ?? ""} email={profile.email} />
          <PasswordForm hasPassword={profile.hasPassword} />

          {/* เมนูท้ายหน้าแบบแอป — จอใหญ่มี sidebar/เมนูผู้ใช้อยู่แล้ว */}
          <Card className="gap-0 overflow-hidden py-0 lg:hidden">
            <Link
              href="/settings"
              className="flex items-center gap-3 px-4 py-3.5 text-sm transition-colors active:bg-accent"
            >
              <Settings className="size-5 text-muted-foreground" />
              <span className="flex-1">{t("user.accountSettings")}</span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
            <button
              type="button"
              onClick={() => setConfirmSignOut(true)}
              className="flex items-center gap-3 border-t px-4 py-3.5 text-left text-sm text-destructive transition-colors active:bg-accent"
            >
              <LogOut className="size-5" />
              <span className="flex-1">{t("user.signOut")}</span>
            </button>
          </Card>
        </div>
      </div>

      <AvatarViewerDialog
        src={image}
        name={profile.name ?? profile.email}
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        onChange={pickFile}
        onRemove={() => setConfirmRemove(true)}
      />

      <AvatarPreviewDialog
        src={pending}
        name={profile.name}
        email={profile.email}
        onConfirm={handleConfirmUpload}
        onChooseAnother={pickFile}
        onCancel={() => setPending(null)}
      />

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={t("profile.removePhoto")}
        description={t("profile.removePhotoDesc")}
        confirmText={t("profile.removePhoto")}
        onConfirm={handleRemove}
      />

      <SignOutDialog open={confirmSignOut} onOpenChange={setConfirmSignOut} />
    </>
  );
}
