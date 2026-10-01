"use client";

import * as React from "react";

import { BrandIcon } from "@/config/brand";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";

/**
 * ============================================================================
 * ม่านโหลดเต็มจอระหว่างบันทึกข้อมูล (create / update / delete) — มาตรฐานของระบบ
 * ============================================================================
 * ไม่ต้องต่อสายเองใน module — `useOptimisticList().mutate()` เรียก beginMutation()
 * ให้อัตโนมัติ และปิดเองเมื่อ transition จบ (รวม router.refresh() แล้ว)
 *
 * - นับจำนวนงานที่ค้าง (counter) — หลายงานพร้อมกันก็ปิดเมื่องานสุดท้ายจบ
 * - รอ SHOW_DELAY_MS ก่อนโผล่ กันกระพริบเมื่องานเสร็จเร็วมาก
 * - โผล่แล้วต้องค้างอย่างน้อย MIN_VISIBLE_MS ไม่ให้วาบหายจนอ่านไม่ทัน
 *
 * งานเขียนข้อมูลที่ไม่ได้ผ่าน mutate() (เช่น async onConfirm ของ ConfirmDialog)
 * เรียก `const end = beginMutation("common.processing")` แล้ว `end()` ใน finally
 *
 * งานอัปโหลดไฟล์ใช้ `const upload = beginProgress("common.uploading")` — ม่านแสดง % และแถบวิ่งจนเต็ม
 * - มีค่าจริง (เช่น xhr.upload.onprogress) → `upload.set(percent)`
 * - ไม่มีค่าจริง (server action) → ไม่ต้องเรียก set ม่านจะค่อย ๆ วิ่งเองจนเกือบเต็ม
 * - `upload.end()` ใน finally → วิ่งถึง 100% ค้างให้เห็นแป๊บหนึ่งแล้วค่อยปิด
 */

export const SHOW_DELAY_MS = 150;
export const MIN_VISIBLE_MS = 450;
export const FADE_MS = 200;
/** กันค้าง: งานไหนไม่จบภายในเวลานี้ ปล่อยม่านเองเพื่อไม่ให้ผู้ใช้ติดอยู่ */
export const FAIL_SAFE_MS = 30_000;

export const DEFAULT_MUTATION_LABEL = "common.saving";

/** งานแบบมี % ที่ไม่มีค่าจริง: วิ่งเองทุก ๆ TRICKLE_MS เข้าหา TRICKLE_MAX (ไม่ถึง 100 จนกว่างานจบ) */
export const TRICKLE_MS = 200;
export const TRICKLE_MAX = 95;
/** งานแบบมี % จบแล้ว → ค้างที่ 100% ไว้เท่านี้ให้ผู้ใช้เห็นว่าเต็มก่อนปิด */
export const COMPLETE_HOLD_MS = 400;

/** progress = null → ม่านแบบไม่มี % (แถบวิ่งวน) */
type Entry = { id: number; labelKey: string; progress: number | null };
type Snapshot = { count: number; labelKey: string; progress: number | null };

let seq = 0;
let entries: Entry[] = [];
let snapshot: Snapshot = { count: 0, labelKey: DEFAULT_MUTATION_LABEL, progress: null };
const listeners = new Set<() => void>();

function emit() {
  const latest = entries[entries.length - 1];
  snapshot = {
    count: entries.length,
    labelKey: latest?.labelKey ?? DEFAULT_MUTATION_LABEL,
    progress: latest?.progress ?? null,
  };
  listeners.forEach((listener) => listener());
}

function patch(id: number, progress: number) {
  entries = entries.map((entry) => (entry.id === id ? { ...entry, progress } : entry));
  emit();
}

/**
 * เริ่มนับงานเขียนข้อมูล 1 งาน — คืนฟังก์ชันสำหรับปิดงานนั้น (เรียกซ้ำได้ ไม่นับซ้อน)
 * @param labelKey คีย์ i18n ของข้อความบนม่าน (ค่าเริ่มต้น "common.saving")
 */
export function beginMutation(labelKey: string = DEFAULT_MUTATION_LABEL): () => void {
  const id = ++seq;
  entries = [...entries, { id, labelKey, progress: null }];
  emit();

  let done = false;
  const failSafe = setTimeout(end, FAIL_SAFE_MS);

  function end() {
    if (done) return;
    done = true;
    clearTimeout(failSafe);
    entries = entries.filter((entry) => entry.id !== id);
    emit();
  }

  return end;
}

export type ProgressHandle = {
  /** รายงาน % จริง (0–100) — เรียกครั้งแรกแล้วการวิ่งเองจะหยุด */
  set: (percent: number) => void;
  /** จบงาน: วิ่งถึง 100% ค้าง COMPLETE_HOLD_MS แล้วปิด (เรียกซ้ำได้) */
  end: () => void;
};

/**
 * เริ่มงานแบบมี % (เช่นอัปโหลดไฟล์) — ม่านแสดงตัวเลข % และแถบที่วิ่งจนเต็ม
 * @param labelKey คีย์ i18n ของข้อความบนม่าน (ค่าเริ่มต้น "common.uploading")
 */
export function beginProgress(labelKey = "common.uploading"): ProgressHandle {
  const id = ++seq;
  let progress = 0;
  entries = [...entries, { id, labelKey, progress }];
  emit();

  let done = false;
  let trickle: ReturnType<typeof setInterval> | undefined = setInterval(() => {
    progress = Math.min(TRICKLE_MAX, progress + Math.max(0.5, (TRICKLE_MAX - progress) * 0.08));
    patch(id, progress);
  }, TRICKLE_MS);
  const failSafe = setTimeout(end, FAIL_SAFE_MS);

  function stopTrickle() {
    clearInterval(trickle);
    trickle = undefined;
  }

  function set(percent: number) {
    if (done) return;
    stopTrickle();
    // ไม่ถอยหลัง และเก็บ 100 ไว้ให้ end() เท่านั้น
    progress = Math.max(progress, Math.min(Math.max(percent, 0), 99));
    patch(id, progress);
  }

  function end() {
    if (done) return;
    done = true;
    stopTrickle();
    clearTimeout(failSafe);
    patch(id, 100);
    setTimeout(() => {
      entries = entries.filter((entry) => entry.id !== id);
      emit();
    }, COMPLETE_HOLD_MS);
  }

  return { set, end };
}

/** จำนวนงานที่ยังค้างอยู่ — มีไว้ให้เทสต์/ดีบักอ่าน */
export function getPendingMutations() {
  return snapshot.count;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const serverSnapshot: Snapshot = { count: 0, labelKey: DEFAULT_MUTATION_LABEL, progress: null };

type Phase = "hidden" | "visible" | "leaving";

export function MutationOverlay() {
  const { t } = useI18n();
  const { count, labelKey, progress } = React.useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => serverSnapshot,
  );
  const active = count > 0;

  const [phase, setPhase] = React.useState<Phase>("hidden");
  const shownAt = React.useRef(0);
  // ค้างข้อความล่าสุดไว้ระหว่างจางออก (ตอนนั้น store กลับเป็นค่าเริ่มต้นแล้ว)
  const [shownLabel, setShownLabel] = React.useState(labelKey);
  const [shownProgress, setShownProgress] = React.useState(progress);

  React.useEffect(() => {
    if (!active) return;
    setShownLabel(labelKey);
    setShownProgress(progress);
  }, [active, labelKey, progress]);

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (active) {
      if (phase === "visible") return;
      // กลับมา active ระหว่างกำลังจาง → โชว์ต่อทันทีไม่ต้องรอใหม่
      const delay = phase === "leaving" ? 0 : SHOW_DELAY_MS;
      timer = setTimeout(() => {
        shownAt.current = Date.now();
        setPhase("visible");
      }, delay);
    } else if (phase === "visible") {
      const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt.current));
      timer = setTimeout(() => setPhase("leaving"), remaining);
    } else if (phase === "leaving") {
      timer = setTimeout(() => setPhase("hidden"), FADE_MS);
    }

    return () => clearTimeout(timer);
  }, [active, phase]);

  const visible = phase === "visible";
  const label = t(shownLabel);

  // กันกด Enter/Space ซ้ำบนปุ่มที่โฟกัสค้างอยู่ด้านหลังม่าน (double submit ผ่านคีย์บอร์ด)
  React.useEffect(() => {
    if (!visible) return;
    function block(event: KeyboardEvent) {
      event.preventDefault();
      event.stopPropagation();
    }
    document.addEventListener("keydown", block, { capture: true });
    return () => document.removeEventListener("keydown", block, { capture: true });
  }, [visible]);

  return (
    <>
      {/* live region อยู่ตลอด เพื่อให้ screen reader ประกาศทันทีที่ข้อความโผล่ */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {visible ? label : ""}
      </div>

      {phase !== "hidden" ? (
        <div
          data-state={visible ? "open" : "closed"}
          aria-busy={visible}
          aria-hidden={!visible}
          className={cn(
            "fixed inset-0 z-[90] grid font-sans place-items-center bg-background/55 p-4 backdrop-blur-[3px]",
            "transition-opacity duration-200 ease-out motion-reduce:transition-none",
            "opacity-0 data-[state=open]:opacity-100",
            // บล็อกการคลิก/แตะทุกอย่างด้านหลังระหว่างบันทึก
            "cursor-wait touch-none select-none",
          )}
          onPointerDown={(event) => event.preventDefault()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div
            className={cn(
              "flex min-w-56 flex-col items-center gap-4 rounded-2xl border bg-card/95 px-8 py-7 text-card-foreground shadow-2xl shadow-primary/10",
              "transition-transform duration-200 ease-out motion-reduce:transition-none",
              visible ? "scale-100" : "scale-95",
            )}
          >
            <div className="relative grid size-16 place-items-center">
              {/* วงแหวนพื้น + ส่วนโค้งที่หมุน */}
              <span className="absolute inset-0 rounded-full border-4 border-primary/15" />
              <span className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary border-r-primary/60 motion-safe:animate-spin motion-safe:[animation-duration:0.9s]" />
              <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/30 motion-safe:animate-pulse">
                <BrandIcon className="size-5" />
              </span>
            </div>

            <div className="space-y-1 text-center">
              <p className="text-sm font-semibold">{label}</p>
              <p className="text-xs text-muted-foreground">{t("common.pleaseWait")}</p>
            </div>

            {shownProgress === null ? (
              <div className="relative h-[3px] w-32 overflow-hidden rounded-full bg-foreground/10">
                <span className="absolute inset-y-0 w-2/5 rounded-full bg-primary motion-safe:[animation:splash-slide_1.1s_cubic-bezier(0.65,0,0.35,1)_infinite]" />
              </div>
            ) : (
              <div className="flex w-48 flex-col items-center gap-2">
                <span className="text-2xl font-semibold tabular-nums text-primary">
                  {Math.round(shownProgress)}%
                </span>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(shownProgress)}
                  aria-label={label}
                  className="h-2 w-full overflow-hidden rounded-full bg-foreground/10"
                >
                  <span
                    className="block h-full rounded-full bg-primary transition-[width] duration-200 ease-out motion-reduce:transition-none"
                    style={{ width: `${shownProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
