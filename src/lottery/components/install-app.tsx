"use client";

import * as React from "react";
import { Download, Share, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BrandIcon } from "@/config/brand";
import { useI18n } from "@/i18n/client";

/** event ที่ Chrome/Edge (Android, Windows, macOS, ChromeOS) ส่งมาเมื่อแอปติดตั้งได้ — ยังไม่มีใน lib.dom */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Mode = "prompt" | "ios" | "mac-safari";

const DISMISS_KEY = "install-app-dismissed";
/** กด "ไว้ทีหลัง" แล้วซ่อนกี่วัน */
const DISMISS_DAYS = 14;

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function dismissedRecently() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return at > 0 && Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

/** iOS / iPadOS / macOS Safari ไม่มีปุ่มติดตั้งให้เรียกจากโค้ด — ต้องบอกขั้นตอนเอง */
function manualMode(): Mode | null {
  const ua = navigator.userAgent;
  const touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1; // iPadOS แสดงตัวเป็น Mac
  if (/iPhone|iPad|iPod/.test(ua) || touchMac) return "ios";
  const safari = /Safari/.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Firefox/.test(ua);
  if (/Macintosh/.test(ua) && safari) return "mac-safari";
  return null;
}

/**
 * การ์ดชวนติดตั้งแอป (PWA) — รองรับทุกระบบ
 * - Android / Windows / macOS / ChromeOS บน Chrome หรือ Edge → ปุ่มติดตั้งจริง (beforeinstallprompt)
 * - iPhone / iPad → บอกให้กดแชร์ → เพิ่มไปยังหน้าจอโฮม
 * - macOS Safari → บอกให้ใช้ ไฟล์ → เพิ่มไปยัง Dock
 * ไม่แสดงเมื่อเปิดจากแอปที่ติดตั้งแล้ว หรือผู้ใช้กด "ไว้ทีหลัง" ภายใน DISMISS_DAYS วัน
 */
export function InstallApp() {
  const { t } = useI18n();
  const [mode, setMode] = React.useState<Mode | null>(null);
  const deferred = React.useRef<BeforeInstallPromptEvent | null>(null);

  React.useEffect(() => {
    if (isStandalone() || dismissedRecently()) return;

    setMode(manualMode());

    const onPrompt = (event: Event) => {
      event.preventDefault(); // ใช้การ์ดของเราแทนแถบของเบราว์เซอร์
      deferred.current = event as BeforeInstallPromptEvent;
      setMode("prompt");
    };
    const onInstalled = () => setMode(null);

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!mode) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // เก็บไม่ได้ (โหมดส่วนตัว) — ซ่อนเฉพาะรอบนี้
    }
    setMode(null);
  };

  const install = async () => {
    const event = deferred.current;
    if (!event) return;
    await event.prompt();
    const { outcome } = await event.userChoice;
    deferred.current = null;
    if (outcome === "accepted") setMode(null);
    else dismiss();
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <BrandIcon className="size-6" />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="font-semibold">{t("lottery.installTitle")}</p>
            <p className="text-sm text-muted-foreground">
              {mode === "prompt" ? t("lottery.installDesc") : null}
              {mode === "ios" ? (
                <>
                  <Share aria-hidden className="mr-1 inline size-4 align-text-bottom text-primary" />
                  {t("lottery.installIos")}
                </>
              ) : null}
              {mode === "mac-safari" ? t("lottery.installMacSafari") : null}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {mode === "prompt" ? (
            <Button className="w-full sm:w-auto" onClick={install}>
              <Download />
              {t("lottery.installButton")}
            </Button>
          ) : null}
          <Button variant="ghost" className="w-full sm:w-auto" onClick={dismiss}>
            <X />
            {t("lottery.installLater")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
