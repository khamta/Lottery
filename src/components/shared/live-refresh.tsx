"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * ให้ server component ของหน้านี้ render ใหม่ทุก `intervalMs` ขณะเปิดแท็บอยู่
 * (ใช้กับข้อมูลที่เปลี่ยนเองโดยผู้ใช้คนอื่น เช่นสถานะออนไลน์) — client ยังไม่ fetch เอง ตามกฎข้อ 1
 */
export function LiveRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();

  React.useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);

  return null;
}
