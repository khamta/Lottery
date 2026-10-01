"use client";

import * as React from "react";

import { heartbeat } from "@/app/(dashboard)/actions";
import { HEARTBEAT_MS } from "@/lib/presence";

/**
 * ส่ง heartbeat ทุก HEARTBEAT_MS ขณะที่แท็บยังเปิดให้เห็นอยู่ — ซ่อนแท็บแล้วหยุด (เกินเวลาก็กลายเป็นออฟไลน์เอง)
 * กลับมาที่แท็บจะส่งทันที ไม่ต้องรอรอบถัดไป · ไม่แสดงอะไรบนจอ และไม่ผ่าน mutate() เพราะไม่ได้แตะข้อมูลบนจอ
 */
export function PresenceHeartbeat() {
  React.useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    const beat = () => {
      heartbeat({}).catch(() => {
        // เน็ตหลุด/เซิร์ฟเวอร์ปิดชั่วคราว — รอบถัดไปค่อยลองใหม่ ไม่ต้องรบกวนผู้ใช้
      });
    };

    const start = () => {
      beat();
      clearInterval(timer);
      timer = setInterval(beat, HEARTBEAT_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else clearInterval(timer);
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
