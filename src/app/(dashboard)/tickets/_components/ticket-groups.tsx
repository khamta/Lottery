"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, CheckCheck, Layers, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { startRouteProgress } from "@/components/shared/route-progress";
import { useI18n } from "@/i18n/client";
import { buildQueryString, toRoute } from "@/lib/query";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lottery/format";
import { ALL_GROUPS, NO_GROUP, type TicketGroupOption } from "../types";

/** ตัวเลขบนป้ายยังไม่ได้ดู — เกินนี้แสดง 99+ เหมือนแอปแชท */
const BADGE_MAX = 99;
const badge = (count: number) => (count > BADGE_MAX ? `${BADGE_MAX}+` : String(count));

/**
 * แถบกลุ่มของหน้าโพย (เหมือนรายชื่อแชท) — เขียนกลุ่มที่เลือกลง URL (?group=) ให้ server กรองที่ฐานข้อมูล
 *
 *  - กดกลุ่ม = ดูกลุ่มนั้นกลุ่มเดียว · เปิด "รวมหลายกลุ่ม" แล้วกด = เพิ่ม/เอาออกจากชุดที่ดูรวมกัน · "ทุกกลุ่ม" = ?group=all
 *  - ป้ายตัวเลขบนกลุ่ม = โพยที่ยังไม่ได้ดู · "ดูทั้งหมดแล้ว" = ทำเครื่องหมายเฉพาะกลุ่มที่ดูอยู่
 *  - ดึงข้อมูลล่าสุด = ให้ server render ใหม่ (client ไม่ fetch เอง)
 */
export function TicketGroups({
  options,
  selected,
  onMarkSeen,
  disabled,
}: {
  options: TicketGroupOption[];
  /** กลุ่มที่ดูอยู่ — null = ทุกกลุ่ม */
  selected: string[] | null;
  /** กด "ดูทั้งหมดแล้ว" ของกลุ่มที่ดูอยู่ (view ยิง action ผ่าน mutate) */
  onMarkSeen: (groupKeys: string[]) => void;
  disabled?: boolean;
}) {
  const { t, intl } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();
  const [isRefreshing, startRefresh] = React.useTransition();
  // โหมดรวมหลายกลุ่ม: เป็นสถานะของปุ่มบนจอเท่านั้น (สิ่งที่เลือกอยู่ใน URL) — เข้ามาพร้อมหลายกลุ่มก็เปิดไว้ให้เลย
  const [merging, setMerging] = React.useState(() => (selected?.length ?? 0) > 1);

  const viewing = selected ?? options.map((option) => option.key);
  const unread = options.filter((option) => viewing.includes(option.key)).reduce((sum, option) => sum + option.unread, 0);
  const unreadAll = options.reduce((sum, option) => sum + option.unread, 0);

  function select(group: string) {
    const qs = buildQueryString(searchParams, { group, page: 1 });
    startRouteProgress();
    startTransition(() => router.replace(toRoute(`${pathname}?${qs}`), { scroll: false }));
  }

  function pick(key: string) {
    if (!merging || !selected) return select(key);
    const next = selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key];
    if (next.length) select(next.join(","));
  }

  const busy = disabled || isPending;
  const name = (option: TicketGroupOption) => option.name ?? t("tickets.groupNone");

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <div
        role="group"
        aria-label={t("tickets.groups")}
        className="scroll-area -mx-4 flex min-w-0 flex-1 gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
      >
        <GroupChip
          label={t("tickets.groupAll")}
          active={selected === null}
          unread={unreadAll}
          disabled={busy}
          onClick={() => select(ALL_GROUPS)}
        />
        {options.map((option) => (
          <GroupChip
            key={option.key}
            label={name(option)}
            hint={t("tickets.groupTotal", { count: formatNumber(option.total, intl) })}
            active={!!selected?.includes(option.key)}
            check={merging}
            muted={option.total === 0 && option.key !== NO_GROUP}
            unread={option.unread}
            disabled={busy}
            onClick={() => pick(option.key)}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:flex sm:shrink-0">
        <Button
          type="button"
          variant={merging ? "default" : "outline"}
          aria-pressed={merging}
          title={t("tickets.groupMergeHint")}
          disabled={busy}
          onClick={() => setMerging((value) => !value)}
        >
          <Layers />
          <span className="truncate">{t("tickets.groupMerge")}</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          title={t("tickets.markSeenHint")}
          disabled={busy || unread === 0}
          onClick={() => onMarkSeen(viewing)}
        >
          <CheckCheck />
          <span className="truncate">{unread ? t("tickets.markSeenCount", { count: badge(unread) }) : t("tickets.markSeen")}</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          title={t("tickets.refresh")}
          disabled={isRefreshing}
          onClick={() => startRefresh(() => router.refresh())}
        >
          <RefreshCw className={cn(isRefreshing && "animate-spin")} />
          <span className="truncate">{t("tickets.refresh")}</span>
        </Button>
      </div>
    </div>
  );
}

function GroupChip({
  label,
  hint,
  active,
  check,
  muted,
  unread,
  disabled,
  onClick,
}: {
  label: string;
  hint?: string;
  active: boolean;
  /** โหมดรวมหลายกลุ่ม — แสดงช่องติ๊กให้รู้ว่ากดแล้วเป็นการเพิ่ม/เอาออก */
  check?: boolean;
  /** กลุ่มที่ยังไม่มีโพยในงวดนี้ */
  muted?: boolean;
  unread: number;
  disabled?: boolean;
  onClick: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      aria-pressed={active}
      title={hint}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-sm whitespace-nowrap transition-colors disabled:opacity-60",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
        !active && muted && "text-muted-foreground",
      )}
    >
      {check ? (
        <span
          aria-hidden
          className={cn(
            "flex size-4 items-center justify-center rounded-sm border",
            active ? "border-primary-foreground" : "border-muted-foreground",
          )}
        >
          {active ? <Check className="size-3" /> : null}
        </span>
      ) : null}
      <span className="max-w-48 truncate">{label}</span>
      {unread > 0 ? (
        <span
          aria-label={t("tickets.unread", { count: unread })}
          className={cn(
            "min-w-5 rounded-full px-1.5 text-center text-xs leading-5 font-semibold tabular-nums",
            active ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground",
          )}
        >
          {badge(unread)}
        </span>
      ) : null}
    </button>
  );
}
