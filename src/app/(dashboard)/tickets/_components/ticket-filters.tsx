"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CircleAlert, Coins, FilterX, ImageIcon } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { startRouteProgress } from "@/components/shared/route-progress";
import { useI18n } from "@/i18n/client";
import { buildQueryString, toRoute } from "@/lib/query";
import { TICKET_STATUSES, statusKey, type DrawOption, type TicketFilterValues } from "../types";

/** Radix Select ไม่รับค่าว่าง จึงใช้ค่านี้แทน "ทั้งหมด" */
const ALL = "all";

/**
 * ตัวกรองงวด / สถานะ / ยอดต่อตัว / ยอดกีบแปลก — เขียนค่าลง URL (?draw=&status=&amount=&odd=1) ให้ server กรองที่ฐานข้อมูล
 * ยอดต่อตัว = มีรายการแทงยอดเท่านี้พอดี (กด Enter หรือออกจากช่องเพื่อค้น · ล้างช่อง = ไม่กรอง)
 * มีรูป = เฉพาะโพยที่มีรูป (?image=1) — ปุ่มบอกจำนวนโพยที่มีรูปของงวดที่กรองอยู่
 * ยอดกีบแปลก = มีรายการกีบไม่ลงท้าย 000 (เช่น 12,112) มักเป็นอ่านรูป/พิมพ์ผิด — ปุ่มบอกจำนวนให้รู้ว่ามีต้องตรวจไหม
 */
export function TicketFilters({
  draws,
  filters,
  oddLakCount,
  imageCount,
  disabled,
}: {
  draws: DrawOption[];
  filters: TicketFilterValues;
  oddLakCount: number;
  imageCount: number;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();

  function apply(patch: Record<string, string | null>) {
    const qs = buildQueryString(searchParams, { ...patch, page: 1 });
    startRouteProgress();
    startTransition(() => router.replace(toRoute(`${pathname}?${qs}`), { scroll: false }));
  }

  // ช่องยอดต่อตัว: พิมพ์ได้อิสระ ค้นเมื่อกด Enter / ออกจากช่อง — URL เปลี่ยน (เช่นกดย้อนกลับ) ก็ตามค่าใหม่
  const urlAmount = filters.amount ? String(filters.amount) : "";
  const [amount, setAmount] = React.useState(urlAmount);
  React.useEffect(() => setAmount(urlAmount), [urlAmount]);

  function applyAmount() {
    const value = amount.replace(/[,\s]/g, "");
    if (value !== urlAmount) apply({ amount: value || null });
  }

  // ตัวกรองที่ผู้ใช้ตั้งเอง (ไม่นับกลุ่ม — กลุ่มถูกเลือกให้เสมอ)
  const hasFilters =
    searchParams.has("draw") || !!searchParams.get("q") || !!filters.status || filters.oddLak || !!filters.amount || !!filters.image;

  return (
    // มือถือ: ตาราง 2 คอลัมน์ (งวด | สถานะ · ยอด | มีรูป · ยอดกีบแปลก | ล้าง) — ไม่ต้องเลื่อนผ่านปุ่มเต็มจอทีละแถว
    // จอใหญ่: [งวด สถานะ ยอดต่อตัว] | [มีรูป ยอดกีบแปลก] … [ล้าง] ชิดขวา — ขึ้นบรรทัดใหม่เองเมื่อจอแคบ
    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
      {/* "ทุกงวด" ต้องเขียน draw=all ลง URL เพราะไม่ระบุ = งวดที่เปิดรับล่าสุด · เปลี่ยนงวด = กลับไปกลุ่มเริ่มต้นของงวดนั้น (กลุ่มที่มีโพยล่าสุด) */}
      <Select
        value={filters.drawId ?? ALL}
        onValueChange={(value) => apply({ draw: value, group: null })}
        disabled={disabled || isPending}
      >
        <SelectTrigger className="min-w-0 sm:w-44" aria-label={t("tickets.filterDraw")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("tickets.allDraws")}</SelectItem>
          {draws.map((draw) => (
            <SelectItem key={draw.id} value={draw.id}>
              {draw.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.status ?? ALL}
        onValueChange={(value) => apply({ status: value === ALL ? null : value })}
        disabled={disabled || isPending}
      >
        <SelectTrigger className="min-w-0 sm:w-36" aria-label={t("tickets.filterStatus")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("tickets.allStatuses")}</SelectItem>
          {TICKET_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {t(statusKey[status])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="relative min-w-0 sm:w-36 sm:flex-none">
        <Coins className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          onBlur={applyAmount}
          onKeyDown={(event) => {
            if (event.key === "Enter") applyAmount();
          }}
          placeholder={t("tickets.filterAmount")}
          aria-label={t("tickets.filterAmount")}
          title={t("tickets.filterAmountHint")}
          disabled={disabled || isPending}
          className="pl-8"
        />
      </div>

      <span aria-hidden className="hidden h-6 w-px bg-border sm:block" />

      <Button
        type="button"
        variant={filters.image ? "default" : "outline"}
        aria-pressed={!!filters.image}
        className="min-w-0 sm:w-auto"
        disabled={disabled || isPending || (!filters.image && imageCount === 0)}
        title={t("tickets.filterImageHint")}
        onClick={() => apply({ image: filters.image ? null : "1" })}
      >
        <ImageIcon />
        <span className="truncate">{t("tickets.filterImage", { count: imageCount })}</span>
      </Button>

      <Button
        type="button"
        variant={filters.oddLak ? "default" : "outline"}
        aria-pressed={filters.oddLak}
        className="min-w-0 sm:w-auto"
        disabled={disabled || isPending || (!filters.oddLak && oddLakCount === 0)}
        title={t("tickets.filterOddLakHint")}
        onClick={() => apply({ odd: filters.oddLak ? null : "1" })}
      >
        <CircleAlert className={filters.oddLak || oddLakCount === 0 ? undefined : "text-warning"} />
        <span className="truncate">{t("tickets.filterOddLak", { count: oddLakCount })}</span>
      </Button>

      {/* หน้านี้จำตัวกรองไว้ (กลับมาจากหน้าอื่นยังกรองเหมือนเดิม) จึงต้องมีทางกลับไปค่าเริ่มต้นในคลิกเดียว */}
      {hasFilters ? (
        <Button
          type="button"
          variant="ghost"
          className="min-w-0 sm:ml-auto sm:w-auto"
          disabled={disabled || isPending}
          onClick={() => apply({ draw: null, group: null, status: null, odd: null, amount: null, image: null, q: null })}
        >
          <FilterX />
          <span className="truncate">{t("tickets.clearFilters")}</span>
        </Button>
      ) : null}
    </div>
  );
}
