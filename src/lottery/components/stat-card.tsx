import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type Stat = { label: string; value: string; hint?: string; icon: LucideIcon };

/** การ์ดตัวเลขสรุป — มือถือ 2 คอลัมน์ขนาดกะทัดรัดแบบแอป ตั้งแต่ lg ขึ้นไป 4 คอลัมน์ */
export function StatCards({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="animate-in-up min-w-0 gap-1.5 py-3 sm:gap-3 sm:py-6">
          <CardHeader className="px-3 sm:px-6">
            <CardDescription className="flex min-w-0 items-center gap-1.5 text-xs sm:gap-2 sm:text-sm">
              <stat.icon className="size-3.5 shrink-0 sm:size-4" aria-hidden />
              <span className="truncate">{stat.label}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="min-w-0 space-y-0.5 px-3 sm:space-y-1 sm:px-6">
            <CardTitle
              className="truncate text-lg leading-tight font-bold tabular-nums sm:text-2xl sm:leading-none sm:font-semibold"
              title={stat.value}
            >
              {stat.value}
            </CardTitle>
            {stat.hint ? (
              <p className="truncate text-[0.6875rem] text-muted-foreground sm:text-xs">{stat.hint}</p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
