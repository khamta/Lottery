import * as React from "react";
import { cn } from "@/lib/utils";

/*
 * ระยะภายในการ์ดอ่านจากตัวแปร --card-px / --card-py / --card-gap (globals.css)
 * มือถือ 16px แบบแอป, ตั้งแต่ sm ขึ้นไป 24px เท่าเดิม — ยังส่ง className="py-0 gap-0" (tailwind-merge 2.x รู้จัก [var(..)] จึงตัดทิ้งได้ถูก) ทับได้ตามปกติ
 * มือถือใช้เส้นขอบบาง ๆ ไม่มีเงา (แบบ grouped card ของ iOS/Android) จอใหญ่มีเงาเบา ๆ เหมือนเดิม
 */
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col gap-[var(--card-gap)] rounded-xl border bg-card py-[var(--card-py)] text-card-foreground sm:shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "grid auto-rows-min items-start gap-1 px-[var(--card-px)] sm:gap-1.5 has-[[data-slot=card-action]]:grid-cols-[1fr_auto]",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold tracking-tight", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-[0.8125rem] text-muted-foreground sm:text-sm", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-[var(--card-px)]", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-[var(--card-px)] [.border-t]:pt-[var(--card-py)]", className)}
      {...props}
    />
  );
}

export { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter };
