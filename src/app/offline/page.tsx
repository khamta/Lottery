"use client";

import { useEffect } from "react";
import { RotateCw, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";

/**
 * หน้าที่ service worker แสดงแทนเมื่อเปิดหน้าใด ๆ ตอนไม่มีเน็ต (ดู public/sw.js)
 * กลับมาออนไลน์เมื่อไหร่ก็โหลดหน้าเดิมใหม่ให้เอง
 */
export default function OfflinePage() {
  const { t } = useI18n();

  useEffect(() => {
    const reload = () => window.location.reload();
    window.addEventListener("online", reload);
    return () => window.removeEventListener("online", reload);
  }, []);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="grid size-16 place-items-center rounded-2xl bg-muted text-muted-foreground">
        <WifiOff className="size-8" />
      </div>
      <h1 className="text-xl font-semibold">{t("pwa.offlineTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("pwa.offlineDesc")}</p>
      <Button onClick={() => window.location.reload()} className="w-full sm:w-auto">
        <RotateCw /> {t("common.retry")}
      </Button>
    </div>
  );
}
