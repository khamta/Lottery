"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Store } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { beginMutation } from "@/components/shared/mutation-overlay";
import { startRouteProgress } from "@/components/shared/route-progress";
import { useI18n } from "@/i18n/client";
import { handleResult } from "@/lib/notify";
import { toRoute } from "@/lib/query";
import { selectDealer } from "@/app/(dashboard)/dealers/actions";
import type { DealerOption } from "@/lottery/dealer";

/**
 * สลับแม่หวยที่ทำงานอยู่ — ไม่ใช่การเขียนรายการในตาราง จึงไม่ผ่าน mutate() แต่เปิดม่านโหลดด้วย beginMutation()
 * หลังสลับจะล้างตัวกรองใน URL (?draw=...) เพราะเป็นงวดของแม่หวยเดิม
 */
export function useSwitchDealer() {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = React.useTransition();

  const switchTo = React.useCallback(
    (id: string) => {
      const end = beginMutation("dealers.switching");
      startTransition(async () => {
        try {
          const result = await selectDealer({ id });
          if (!handleResult(result)) return;
          startRouteProgress();
          router.replace(toRoute(pathname), { scroll: false });
          router.refresh();
        } finally {
          end();
        }
      });
    },
    [router, pathname],
  );

  return { switchTo, isPending };
}

/** ตัวเลขบนป้ายยังไม่ได้ดู — เกินนี้แสดง 99+ (แบบเดียวกับแถบกลุ่มของหน้าโพย) */
const BADGE_MAX = 99;

/**
 * ตัวเลือกแม่หวยบนหัวหน้าของระบบหวย — ข้อมูลทั้งหน้าเปลี่ยนตามแม่หวยที่เลือก
 * unread = จำนวนโพยที่ยังไม่ได้ดูของแต่ละแม่หวย (dealerUnreadCounts) — ป้ายตัวเลขหลังชื่อแม่หวยอื่น
 * และจุดบนไอคอนเมื่อแม่หวยอื่นมีโพยใหม่ (ไม่ต้องเปิดรายการก็รู้ว่าควรสลับไปดู) · ไม่ส่งมา = ไม่แสดง
 */
export function DealerSwitcher({
  dealers,
  currentId,
  unread,
}: {
  dealers: DealerOption[];
  currentId: string;
  unread?: Record<string, number>;
}) {
  const { t } = useI18n();
  const { switchTo, isPending } = useSwitchDealer();
  const othersUnread = unread
    ? dealers.reduce((sum, dealer) => sum + (dealer.id === currentId ? 0 : (unread[dealer.id] ?? 0)), 0)
    : 0;

  return (
    <Select value={currentId} onValueChange={(id) => id !== currentId && switchTo(id)} disabled={isPending}>
      <SelectTrigger
        className="w-full min-w-0 sm:w-52"
        aria-label={t("dealers.current")}
        title={othersUnread ? t("dealers.othersUnread", { count: othersUnread }) : undefined}
      >
        <span className="relative shrink-0">
          <Store className="size-4 text-muted-foreground" aria-hidden />
          {othersUnread ? <span aria-hidden className="absolute -top-1 -right-1 size-2 rounded-full bg-primary" /> : null}
        </span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {dealers.map((dealer) => {
          // แม่หวยที่ใช้อยู่ไม่แสดงตัวเลข: ดูได้จากแถบกลุ่มของหน้าโพยซึ่งลดทันทีที่เปิดดู (ตัวเลขตรงนี้จะค้างจนกว่าหน้าจะโหลดใหม่)
          const count = dealer.id === currentId ? 0 : (unread?.[dealer.id] ?? 0);
          return (
            <SelectItem key={dealer.id} value={dealer.id}>
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate">{dealer.ownerName ? `${dealer.name} · ${dealer.ownerName}` : dealer.name}</span>
                {count ? (
                  <span
                    aria-label={t("dealers.unread", { count })}
                    className="min-w-5 shrink-0 rounded-full bg-primary px-1.5 text-center text-xs leading-5 font-semibold text-primary-foreground tabular-nums"
                  >
                    {count > BADGE_MAX ? `${BADGE_MAX}+` : count}
                  </span>
                ) : null}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
