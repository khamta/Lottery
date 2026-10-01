import { Loader2 } from "lucide-react";

import { BrandIcon } from "@/config/brand";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-4 animate-spin text-muted-foreground", className)} aria-hidden />;
}

/**
 * ใช้ระหว่างรอทั้งหน้า — หน้าตาเดียวกับหน้าจอต้อนรับตอนเปิดแอป
 * (โลโก้เต้นเบา ๆ + แถบวิ่ง) เพื่อให้การรอทุกจุดในระบบรู้สึกต่อเนื่องเป็นชุดเดียวกัน
 */
export function FullPageLoader({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3.5">
      <div className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30 motion-safe:animate-pulse">
        <BrandIcon className="size-7" />
      </div>
      {label ? <p className="text-sm font-medium">{label}</p> : null}
      <div className="relative h-[3px] w-40 overflow-hidden rounded-full bg-foreground/10">
        <span className="absolute inset-y-0 w-2/5 rounded-full bg-primary motion-safe:[animation:splash-slide_1.1s_cubic-bezier(0.65,0,0.35,1)_infinite]" />
      </div>
    </div>
  );
}

/** โครงหน้ามาตรฐานระหว่างรอ: หัวข้อ + แถบเครื่องมือ + ตาราง */
export function PageSkeleton({ columns = 6, rows = 8 }: { columns?: number; rows?: number }) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="space-y-1.5 sm:space-y-2">
        <Skeleton className="h-6 w-36 sm:h-7 sm:w-44" />
        <Skeleton className="h-3.5 w-full max-w-80 sm:h-4" />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-9 w-full sm:max-w-xs" />
        <Skeleton className="h-9 w-32 sm:ml-auto" />
      </div>
      <TableSkeleton columns={columns} rows={rows} />
    </div>
  );
}

export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="rounded-xl border">
      <div className="flex gap-4 border-b px-3 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-3 py-4">
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton key={c} className={cn("h-4 flex-1", c === 0 && "max-w-[40%]")} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    // โครงเดียวกับการ์ดตัวเลขใน dashboard: มือถือ 2 คอลัมน์กะทัดรัด, จอใหญ่เหมือนเดิม
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="min-w-0 gap-2 py-3 sm:gap-6 sm:py-6">
          <CardHeader className="px-3 sm:px-6">
            <Skeleton className="h-3 w-3/4 max-w-24" />
          </CardHeader>
          <CardContent className="space-y-2 px-3 sm:px-6">
            <Skeleton className="h-5 w-4/5 max-w-28 sm:h-7" />
            <Skeleton className="h-3 w-3/5 max-w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="grid gap-5">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="grid gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}
