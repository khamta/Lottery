"use client";

import * as React from "react";
import { Check, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

type CheckboxProps = Omit<React.ComponentProps<"input">, "type" | "onChange"> & {
  /** เลือกบางส่วน (ใช้กับ checkbox "เลือกทั้งหมด") */
  indeterminate?: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

/** checkbox มาตรฐานของระบบ — ใช้ <input> จริง จึงใช้คีย์บอร์ด/ฟอร์ม/screen reader ได้ครบ */
function Checkbox({ className, indeterminate = false, checked, onCheckedChange, ...props }: CheckboxProps) {
  const ref = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  const on = !!checked || indeterminate;

  return (
    <span className={cn("relative inline-grid size-4 shrink-0 place-items-center", className)}>
      <input
        ref={ref}
        type="checkbox"
        data-slot="checkbox"
        checked={!!checked}
        onChange={(event) => onCheckedChange?.(event.target.checked)}
        className={cn(
          "peer size-4 cursor-pointer appearance-none rounded-[4px] border border-input bg-background shadow-xs transition-colors outline-none",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40",
          "disabled:cursor-not-allowed disabled:opacity-50",
          on && "border-primary bg-primary",
        )}
        {...props}
      />
      {on ? (
        indeterminate ? (
          <Minus className="pointer-events-none absolute size-3 text-primary-foreground" strokeWidth={3} />
        ) : (
          <Check className="pointer-events-none absolute size-3 text-primary-foreground" strokeWidth={3} />
        )
      ) : null}
    </span>
  );
}

export { Checkbox };
