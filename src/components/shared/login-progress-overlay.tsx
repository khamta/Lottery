"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";

/**
 * ============================================================================
 * ม่านเปอร์เซ็นต์หลังเข้าสู่ระบบสำเร็จ (0% → 100%)
 * ============================================================================
 * ใช้คู่กับฟอร์ม login: ตั้ง `active` เป็น true เมื่อ signIn สำเร็จ แล้วรอ `onFinish`
 * ค่อยเปลี่ยนหน้า (startRouteProgress() + router.push())
 *
 * ไทม์ไลน์ (รวมไม่เกิน ~1.15 วินาที เพื่อไม่ให้การเข้าระบบรู้สึกช้า):
 * - 0 → RAMP_MS       วิ่งเร็วขึ้นไป 90% แบบ ease-out
 * - RAMP_MS → HOLD_MS ไต่ช้า ๆ เข้าหา 97% (ระหว่างนี้ route /dashboard ถูก prefetch อยู่)
 * - HOLD_MS → +FINISH_MS  ปิดท้ายไป 100% แล้วเรียก onFinish()
 * หลังถึง 100% ม่านค้างไว้ (ขึ้น "พร้อมแล้ว") จนหน้า login ถูกถอดออกเมื่อแดชบอร์ดมาถึง
 *
 * ผู้ใช้ที่ตั้ง prefers-reduced-motion: ไม่มีตัวเลขวิ่ง/วงแหวนเคลื่อน — กระโดดไปค่าเป้าหมายตรง ๆ
 */

export const RAMP_MS = 650;
export const HOLD_MS = 900;
export const FINISH_MS = 250;
export const RAMP_TARGET = 90;
export const CREEP_TARGET = 97;

const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** ค่าเปอร์เซ็นต์ (0–100) ณ เวลาที่ผ่านไป — pure function เพื่อให้เทสต์ได้ */
export function loginProgressAt(elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  if (elapsedMs < RAMP_MS) return RAMP_TARGET * easeOutCubic(elapsedMs / RAMP_MS);

  const creep = (t: number) =>
    RAMP_TARGET + (CREEP_TARGET - RAMP_TARGET) * (1 - Math.exp(-(t - RAMP_MS) / 400));

  if (elapsedMs < HOLD_MS) return creep(elapsedMs);

  const from = creep(HOLD_MS);
  return from + (100 - from) * easeOutCubic(clamp01((elapsedMs - HOLD_MS) / FINISH_MS));
}

/** คีย์ข้อความสถานะตามช่วงเปอร์เซ็นต์ */
export function loginProgressStatusKey(value: number): string {
  if (value >= 100) return "auth.progressReady";
  if (value >= 70) return "auth.progressPreparing";
  if (value >= 30) return "auth.progressLoadingData";
  return "auth.progressVerifying";
}

function usePrefersReducedMotion() {
  return React.useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
      query?.addEventListener?.("change", onChange);
      return () => query?.removeEventListener?.("change", onChange);
    },
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    () => false,
  );
}

const RING_RADIUS = 52;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

type LoginProgressOverlayProps = {
  active: boolean;
  /** เรียกครั้งเดียวเมื่อถึง 100% — จุดที่ควรสั่ง router.push() */
  onFinish?: () => void;
};

export function LoginProgressOverlay({ active, onFinish }: LoginProgressOverlayProps) {
  const { t } = useI18n();
  const reducedMotion = usePrefersReducedMotion();
  const [value, setValue] = React.useState(0);
  const [shown, setShown] = React.useState(false);

  // เก็บ callback ล่าสุดไว้ใน ref — ไม่ให้ animation เริ่มใหม่เมื่อ parent render ซ้ำ
  const onFinishRef = React.useRef(onFinish);
  React.useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  React.useEffect(() => {
    if (!active) {
      setValue(0);
      setShown(false);
      return;
    }

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      setValue(100);
      onFinishRef.current?.();
    };

    // เฟรมถัดไปค่อยตั้ง shown เพื่อให้ transition จาง/ขยายเข้าทำงาน
    const showFrame = requestAnimationFrame(() => setShown(true));

    if (reducedMotion) {
      setValue(RAMP_TARGET);
      const timer = setTimeout(finish, HOLD_MS);
      return () => {
        cancelAnimationFrame(showFrame);
        clearTimeout(timer);
      };
    }

    let frame = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startedAt;
      if (elapsed >= HOLD_MS + FINISH_MS) {
        finish();
        return;
      }
      setValue(loginProgressAt(elapsed));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(showFrame);
      cancelAnimationFrame(frame);
    };
  }, [active, reducedMotion]);

  // กันกด Enter/Space ซ้ำบนปุ่ม/ช่องที่โฟกัสค้างอยู่ด้านหลังม่าน
  React.useEffect(() => {
    if (!active) return;
    function block(event: KeyboardEvent) {
      event.preventDefault();
      event.stopPropagation();
    }
    document.addEventListener("keydown", block, { capture: true });
    return () => document.removeEventListener("keydown", block, { capture: true });
  }, [active]);

  if (!active || typeof document === "undefined") return null;

  const rounded = Math.min(100, Math.round(value));
  const done = rounded >= 100;
  const statusKey = loginProgressStatusKey(rounded);
  const status = t(statusKey);

  // portal ไปที่ body — ผู้ปกครองใน auth layout มี transform (animate-in-up)
  // ซึ่งทำให้ `fixed` อ้างอิงกล่องนั้นแทนหน้าจอ ม่านจึงไม่อยู่กลางจอ
  return createPortal(
    <div
      data-state={shown ? "open" : "closed"}
      aria-busy={!done}
      className={cn(
        "fixed inset-0 z-[90] grid place-items-center bg-background/80 backdrop-blur-md",
        "px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]",
        "transition-opacity duration-300 ease-out motion-reduce:transition-none",
        "opacity-0 data-[state=open]:opacity-100",
        "cursor-wait touch-none select-none",
      )}
      onPointerDown={(event) => event.preventDefault()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        className={cn(
          "flex w-full max-w-xs flex-col items-center gap-5 rounded-3xl border bg-card/95 px-8 py-8 text-card-foreground shadow-2xl shadow-primary/15",
          "transition-transform duration-300 ease-out motion-reduce:transition-none",
          shown ? "scale-100" : "scale-95",
        )}
      >
        {/* วงแหวนความคืบหน้า + ตัวเลขตรงกลาง */}
        <div
          role="progressbar"
          aria-label={t("auth.progressLabel")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={rounded}
          aria-valuetext={`${rounded}% · ${status}`}
          className="relative grid size-36 place-items-center"
        >
          {/* แสงฟุ้งด้านหลัง เข้มขึ้นตามเปอร์เซ็นต์ */}
          <span
            aria-hidden
            className="absolute inset-3 rounded-full bg-primary/20 blur-2xl"
            style={{ opacity: 0.35 + (rounded / 100) * 0.65 }}
          />
          <svg viewBox="0 0 120 120" className="absolute inset-0 size-full -rotate-90" aria-hidden>
            <circle cx="60" cy="60" r={RING_RADIUS} fill="none" strokeWidth="8" className="stroke-primary/15" />
            <circle
              cx="60"
              cy="60"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              className="stroke-primary"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - value / 100)}
              style={{
                filter: "drop-shadow(0 0 6px color-mix(in oklch, var(--primary) 55%, transparent))",
              }}
            />
          </svg>

          <div className="relative flex items-baseline" aria-hidden>
            <span className="text-5xl font-semibold tracking-tight tabular-nums">{rounded}</span>
            <span className="ml-0.5 text-xl font-medium text-muted-foreground">%</span>
          </div>

          {/* เครื่องหมายถูกเด้งขึ้นเมื่อครบ 100% */}
          <span
            aria-hidden
            className={cn(
              "absolute right-2 bottom-2 grid size-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-card",
              "transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none",
              done ? "scale-100 opacity-100" : "scale-50 opacity-0",
            )}
          >
            <Check className="size-5" strokeWidth={3} />
          </span>
        </div>

        <div className="w-full space-y-1.5 text-center" role="status" aria-live="polite" aria-atomic="true">
          <p className="text-base font-semibold">{t("auth.loginSuccess")}</p>
          <p
            key={statusKey}
            className="text-sm text-muted-foreground motion-safe:[animation:in-up_0.3s_cubic-bezier(0.22,1,0.36,1)_both]"
          >
            {status}
          </p>
        </div>

        <div className="relative h-1 w-full overflow-hidden rounded-full bg-foreground/10" aria-hidden>
          <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${value}%` }} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
