"use client";

import * as React from "react";

import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * ช่องข้อความโพยที่มีเลขแถวด้านซ้าย — เลขตรงกับ "แถวที่ …" ที่ตัวแยกโพยรายงาน
 * ไม่ตัดบรรทัด (wrap="off") เพื่อให้หนึ่งแถวบนจอ = หนึ่งบรรทัดของข้อความเสมอ
 */
export function NumberedTextarea({ className, value, onScroll, ...props }: React.ComponentProps<"textarea">) {
  const gutter = React.useRef<HTMLDivElement>(null);
  const lineCount = String(value ?? "").split(/\r?\n/).length;

  return (
    <div className="relative">
      <div
        ref={gutter}
        aria-hidden
        className="pointer-events-none absolute inset-y-px left-px w-10 overflow-hidden rounded-l-md border-r bg-muted/50 py-2 pr-2 text-right text-sm leading-5 text-muted-foreground tabular-nums select-none"
      >
        {Array.from({ length: lineCount }, (_, index) => (
          <div key={index}>{index + 1}</div>
        ))}
        {/* เผื่อที่ให้แถบเลื่อนแนวนอนของช่องข้อความ — เลื่อนสุดแล้วเลขแถวยังตรงกัน */}
        <div className="h-4" />
      </div>
      <Textarea
        wrap="off"
        value={value}
        onScroll={(event) => {
          if (gutter.current) gutter.current.scrollTop = event.currentTarget.scrollTop;
          onScroll?.(event);
        }}
        className={cn("scroll-area pl-12 leading-5 whitespace-pre", className)}
        {...props}
      />
    </div>
  );
}

/** จำนวนแถวที่มีข้อมูล (ไม่นับแถวว่าง) */
export function countFilledLines(text: string) {
  return text.split(/\r?\n/).filter((line) => line.trim()).length;
}
