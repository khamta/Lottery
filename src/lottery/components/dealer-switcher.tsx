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

/** ตัวเลือกแม่หวยบนหัวหน้าของระบบหวย — ข้อมูลทั้งหน้าเปลี่ยนตามแม่หวยที่เลือก */
export function DealerSwitcher({ dealers, currentId }: { dealers: DealerOption[]; currentId: string }) {
  const { t } = useI18n();
  const { switchTo, isPending } = useSwitchDealer();

  return (
    <Select value={currentId} onValueChange={(id) => id !== currentId && switchTo(id)} disabled={isPending}>
      <SelectTrigger className="w-full min-w-0 sm:w-52" aria-label={t("dealers.current")}>
        <Store className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {dealers.map((dealer) => (
          <SelectItem key={dealer.id} value={dealer.id}>
            {dealer.ownerName ? `${dealer.name} · ${dealer.ownerName}` : dealer.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
