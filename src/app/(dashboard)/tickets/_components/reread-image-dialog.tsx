"use client";

import * as React from "react";
import { ScanText, Sparkles } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";
import type { ImageEngineValue } from "@/lib/validations/ticket";

const ENGINES: Array<{ value: ImageEngineValue; icon: typeof ScanText; label: string; hint: string }> = [
  { value: "OCR", icon: ScanText, label: "tickets.engineOCR", hint: "tickets.engineOCRHint" },
  { value: "AI", icon: Sparkles, label: "tickets.engineAI", hint: "tickets.engineAIHint" },
];

/**
 * เลือกตัวอ่านก่อนสั่งอ่านรูปโพยรอตรวจใหม่ (ใบเดียว หรือทั้งงวดของผู้ดูแล) — ไม่เรียก action เอง ส่งตัวอ่านออกทาง onSubmit
 * เลือก AI แล้ว view ถามยืนยันเรื่องค่าใช้จ่ายอีกขั้นก่อนสั่งจริง · เปิดเมื่อ description ไม่เป็น null
 */
export function RereadImageDialog({
  description,
  onOpenChange,
  onSubmit,
}: {
  /** ข้อความบอกว่าจะอ่านอะไร (โพยใบไหน / กี่ใบในงวดไหน) */
  description: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (engine: ImageEngineValue) => void;
}) {
  const { t } = useI18n();
  const open = description !== null;
  // ค่าเริ่มต้นเป็นตัวอ่านปกติ (ไม่มีค่าใช้จ่าย) ทุกครั้งที่เปิด — AI ต้องเลือกเอง
  const [engine, setEngine] = React.useState<ImageEngineValue>("OCR");

  React.useEffect(() => {
    if (open) setEngine("OCR");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("tickets.rereadTitle")}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        <div role="radiogroup" aria-label={t("tickets.engine")} className="grid gap-2">
          {ENGINES.map((option) => {
            const selected = engine === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setEngine(option.value)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors",
                  selected ? "border-primary bg-primary/5" : "hover:bg-muted",
                )}
              >
                <option.icon className={cn("mt-0.5 size-4 shrink-0", selected ? "text-primary" : "text-muted-foreground")} />
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium">{t(option.label)}</span>
                  <span className="text-xs text-muted-foreground">{t(option.hint)}</span>
                </span>
              </button>
            );
          })}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={() => onSubmit(engine)}>
            {engine === "AI" ? <Sparkles /> : <ScanText />} {t("tickets.rereadSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
