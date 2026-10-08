"use client";

import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

/**
 * สวิตช์ "นับยอดอัตโนมัติ" หลัง AI อ่านรูป (ของแม่หวยที่เลือกอยู่) — ไม่เรียก action เอง ส่งออกทาง onToggle
 * components/ui ไม่มี Switch (เป็นไฟล์ core ของ template) จึงทำจาก button + role="switch" เหมือนหน้าแม่หวย
 */
export function AiAutoCountSwitch({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      title={t("tickets.aiAutoCountHint")}
      onClick={onToggle}
      disabled={disabled}
      className="inline-flex h-9 w-full items-center justify-between gap-2 rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 sm:w-auto sm:justify-start"
    >
      <span className={on ? "font-medium" : "text-muted-foreground"}>{t("tickets.aiAutoCount")}</span>
      <span
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent transition-colors",
          on ? "bg-primary" : "bg-input",
        )}
      >
        <span
          className={cn(
            "pointer-events-none block size-4 rounded-full bg-background shadow-sm transition-transform",
            on ? "translate-x-4" : "translate-x-0",
          )}
        />
      </span>
    </button>
  );
}
