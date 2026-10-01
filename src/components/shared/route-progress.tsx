"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * ============================================================================
 * แถบโหลดด้านบนจอ (top loading bar) — มาตรฐานของระบบ
 * ============================================================================
 * โผล่ทันทีที่ผู้ใช้กดลิงก์/เปลี่ยนหน้า/เปลี่ยนตัวกรอง แล้วปิดเองเมื่อหน้าใหม่พร้อม
 * ใช้สีหลักจาก design token จึงเปลี่ยนตามธีมอัตโนมัติ
 *
 * ปกติไม่ต้องเรียกเอง — ดักคลิกลิงก์ให้แล้ว
 * ถ้าเปลี่ยนหน้าด้วย router.push() เอง ให้เรียก startRouteProgress() ก่อน
 */

type Listener = (value: number | null) => void;

let progress: number | null = null; // null = ซ่อนอยู่
const listeners = new Set<Listener>();
let creepTimer: ReturnType<typeof setInterval> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let failSafeTimer: ReturnType<typeof setTimeout> | null = null;

function emit(next: number | null) {
  progress = next;
  listeners.forEach((listener) => listener(progress));
}

function clearTimers() {
  if (creepTimer) clearInterval(creepTimer);
  if (hideTimer) clearTimeout(hideTimer);
  if (failSafeTimer) clearTimeout(failSafeTimer);
  creepTimer = hideTimer = failSafeTimer = null;
}

/** เริ่มแถบโหลด — เรียกซ้ำระหว่างที่ยังวิ่งอยู่ได้ ไม่รีเซ็ต */
export function startRouteProgress() {
  if (progress !== null) return;

  clearTimers();
  emit(10);

  // ไต่ขึ้นแบบช้าลงเรื่อย ๆ ไม่ถึง 100 จนกว่าหน้าใหม่จะพร้อมจริง
  creepTimer = setInterval(() => {
    if (progress === null) return;
    emit(Math.min(progress + (92 - progress) * 0.16, 92));
  }, 180);

  // กันค้าง: ถ้าเกิน 12 วินาทียังไม่จบ ให้ปิดเอง
  failSafeTimer = setTimeout(finishRouteProgress, 12_000);
}

/** ปิดแถบโหลด (วิ่งไป 100% แล้วค่อยจาง) */
export function finishRouteProgress() {
  if (progress === null) return;

  clearTimers();
  emit(100);
  hideTimer = setTimeout(() => emit(null), 280);
}

/** ค่าปัจจุบันของแถบ (null = ซ่อนอยู่) — มีไว้ให้เทสต์/ดีบักอ่าน */
export function getRouteProgress() {
  return progress;
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** ใช้ใน component ที่เปลี่ยนหน้าเอง เช่นปุ่มแบ่งหน้า/ช่องค้นหา */
export function useRouteProgress() {
  return { start: startRouteProgress, finish: finishRouteProgress };
}

export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const value = React.useSyncExternalStore(
    subscribe,
    () => progress,
    () => null,
  );

  // หน้าใหม่มาถึงแล้ว → ปิดแถบ
  React.useEffect(() => {
    finishRouteProgress();
  }, [pathname, searchParams]);

  // ดักคลิกลิงก์ภายในเว็บให้เริ่มแถบทันทีที่กด (ก่อน Next จะเริ่มโหลดเสียอีก)
  React.useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || anchor.target === "_blank") return;
      if (anchor.hasAttribute("download") || anchor.dataset.noProgress === "true") return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      startRouteProgress();
    }

    document.addEventListener("click", onClick, { capture: true });
    window.addEventListener("popstate", startRouteProgress);

    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      window.removeEventListener("popstate", startRouteProgress);
    };
  }, []);

  if (value === null) return null;

  return (
    <div
      role="progressbar"
      aria-label="loading"
      aria-hidden={value >= 100}
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5"
    >
      <div
        className="h-full rounded-r-full bg-primary transition-[width,opacity] duration-200 ease-out"
        style={{
          width: `${value}%`,
          opacity: value >= 100 ? 0 : 1,
          boxShadow:
            "0 0 10px color-mix(in oklch, var(--primary) 70%, transparent), 0 0 4px color-mix(in oklch, var(--primary) 50%, transparent)",
        }}
      >
        {/* หัวแถบเรืองแสงแบบ nprogress */}
        <span className="absolute top-0 right-0 h-full w-24 -translate-y-[1px] rotate-3 bg-gradient-to-r from-transparent to-primary opacity-80 blur-[3px]" />
      </div>
    </div>
  );
}
