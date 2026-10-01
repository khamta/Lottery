"use client";

import * as React from "react";

import { useI18n } from "@/i18n/client";

/**
 * ลงทะเบียน service worker (public/sw.js) ให้แอปติดตั้งลงเครื่องได้และมีหน้าออฟไลน์
 * เปิดเฉพาะ production — ตอน dev ถ้ามี cache จะทำให้เห็นโค้ดเก่าค้าง
 */
export function ServiceWorkerRegister() {
  const { locale } = useI18n();

  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      // ให้หน้า /offline ที่เก็บไว้เป็นภาษาปัจจุบันเสมอ
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => reg.active?.postMessage({ type: "refresh-offline" }))
      .catch(() => {
        // ลงทะเบียนไม่ได้ (เช่นไม่ใช่ https) แอปยังใช้งานได้ตามปกติ แค่ติดตั้งไม่ได้
      });
  }, [locale]);

  return null;
}
