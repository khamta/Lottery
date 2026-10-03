"use client";

import * as React from "react";

import { BrandIcon } from "@/config/brand";

/**
 * หน้าจอต้อนรับตอนโหลดครั้งแรก (hard reload)
 * markup ถูกส่งมาพร้อม HTML จาก server จึงเห็นทันทีก่อน JS ทำงานเสร็จ
 * เมื่อ React hydrate เสร็จจะตั้ง data-ready ที่ <html> แล้ว CSS จะค่อย ๆ จางออกไปเอง
 * (สไตล์อยู่ใน globals.css ส่วน #app-splash)
 */
export function SplashGate() {
  React.useEffect(() => {
    const root = document.documentElement;
    // รอให้เฟรมแรกวาดเสร็จก่อน จะได้ไม่เห็นหน้าเปล่าแวบหนึ่ง
    const id = requestAnimationFrame(() => root.setAttribute("data-ready", ""));

    return () => cancelAnimationFrame(id);
  }, []);

  return null;
}

export function AppSplash({ name }: { name: string }) {
  return (
    <div id="app-splash" aria-hidden>
      <div className="splash-inner">
        <div className="splash-logo">
          <BrandIcon className="size-7" />
        </div>
        <p className="splash-name">{name}</p>
        <div className="splash-bar">
          <span />
        </div>
      </div>
    </div>
  );
}
