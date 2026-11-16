"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable } from "@/components/shared/data-table";
import { useOptimisticList } from "@/hooks/use-optimistic-list";
import { useI18n } from "@/i18n/client";
import type { DealerOption } from "@/lottery/dealer";
import { currencyKey, LOTTERY_TYPES, lotteryLabel, type LotteryTypeValue } from "@/lottery/labels";
import type { Currency } from "@/lottery/parser";
import { cn } from "@/lib/utils";
import type { Paginated } from "@/types";
import { formatNumber } from "@/lottery/format";
import { assignWhatsappGroup } from "../../actions";
import type { WhatsappGroupRow } from "../types";

/** Radix Select ไม่รับค่าว่าง จึงใช้ค่านี้แทน "ไม่อ่านกลุ่มนี้" */
const NONE = "none";
/** อ่านรูปโพยของกลุ่ม — Radix Select รับแต่ string · on = อ่านด้วย AI (มีค่าใช้จ่าย) · off = เก็บรูปไว้รอตรวจ */
const READ_IMAGES = { on: "whatsapp.readImagesOn", off: "whatsapp.readImagesOff" } as const;
/** สกุลเงินเริ่มต้นของกลุ่ม — ใช้เมื่อทั้งโพยไม่ระบุสกุลเงินเลย */
const CURRENCIES: readonly Currency[] = ["LAK", "THB"];

type GroupChange = Partial<
  Pick<WhatsappGroupRow, "dealerId" | "lottery" | "readImages" | "threeDigitBottom" | "currency">
>;

/** สวิตช์เปิด/ปิด — components/ui ไม่มี Switch (เป็นไฟล์ core ของ template) จึงทำจาก button + role="switch" */
function ToggleSwitch({
  on,
  label,
  onLabel,
  offLabel,
  disabled,
  onToggle,
}: {
  on: boolean;
  label: string;
  onLabel: string;
  offLabel: string;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className="group inline-flex min-w-36 items-center gap-2 rounded-md text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent transition-colors",
          on ? "bg-primary" : "bg-input",
        )}
      >
        <span
          className={cn(
            "pointer-events-none block size-4 rounded-full bg-background shadow-sm transition-transform",
            on ? "translate-x-4" : "translate-x-0",
          )}
        />
      </span>
      <span className={on ? "font-medium" : "text-muted-foreground"}>{on ? onLabel : offLabel}</span>
    </button>
  );
}

type Translate = (key: string, params?: Record<string, string | number>) => string;

function getGroupColumns({
  t,
  intl,
  dealers,
  onAssign,
}: {
  t: Translate;
  intl: string;
  dealers: DealerOption[];
  onAssign: (row: WhatsappGroupRow, change: GroupChange) => void;
}): ColumnDef<WhatsappGroupRow>[] {
  return [
    {
      id: "name",
      accessorKey: "name",
      header: t("whatsapp.groupName"),
      enableSorting: true,
      cell: ({ row }) => (
        <div className="min-w-40 space-y-0.5">
          <p className="flex items-center gap-2 font-medium">
            {row.original.name}
            {row.original.dealerId ? <Badge variant="success">{t("whatsapp.reading")}</Badge> : null}
          </p>
          <p className="text-xs break-all text-muted-foreground">{row.original.jid}</p>
        </div>
      ),
    },
    {
      id: "size",
      accessorKey: "size",
      header: t("whatsapp.members"),
      enableSorting: true,
      cell: ({ row }) => <span className="tabular-nums">{formatNumber(row.original.size, intl)}</span>,
    },
    {
      id: "dealerId",
      header: t("whatsapp.readInto"),
      enableSorting: false,
      cell: ({ row }) => (
        <Select
          value={row.original.dealerId ?? NONE}
          onValueChange={(value) => onAssign(row.original, { dealerId: value === NONE ? null : value })}
        >
          <SelectTrigger className="w-full min-w-44 sm:w-56" aria-label={t("whatsapp.readInto")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t("whatsapp.notReading")}</SelectItem>
            {dealers.map((dealer) => (
              <SelectItem key={dealer.id} value={dealer.id}>
                {dealer.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      id: "lottery",
      header: t("lottery.lotteryType"),
      enableSorting: false,
      cell: ({ row }) => (
        <Select
          value={row.original.lottery}
          disabled={!row.original.dealerId}
          onValueChange={(value) => onAssign(row.original, { lottery: value as LotteryTypeValue })}
        >
          <SelectTrigger className="w-full min-w-40 sm:w-52" aria-label={t("lottery.lotteryType")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOTTERY_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {lotteryLabel(type, t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      id: "readImages",
      header: t("whatsapp.readImages"),
      enableSorting: false,
      cell: ({ row }) => (
        <Select
          value={row.original.readImages ? "on" : "off"}
          disabled={!row.original.dealerId}
          onValueChange={(value) => onAssign(row.original, { readImages: value === "on" })}
        >
          <SelectTrigger className="w-full min-w-40 sm:w-52" aria-label={t("whatsapp.readImages")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(READ_IMAGES).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {t(label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      id: "threeDigitBottom",
      header: t("whatsapp.threeDigitBottom"),
      enableSorting: false,
      cell: ({ row }) => (
        <ToggleSwitch
          on={row.original.threeDigitBottom}
          label={t("whatsapp.threeDigitBottom")}
          onLabel={t("whatsapp.threeDigitBottomOn")}
          offLabel={t("whatsapp.threeDigitBottomOff")}
          disabled={!row.original.dealerId}
          onToggle={() => onAssign(row.original, { threeDigitBottom: !row.original.threeDigitBottom })}
        />
      ),
    },
    {
      id: "currency",
      header: t("whatsapp.defaultCurrency"),
      enableSorting: false,
      cell: ({ row }) => (
        <Select
          value={row.original.currency}
          disabled={!row.original.dealerId}
          onValueChange={(value) => onAssign(row.original, { currency: value as Currency })}
        >
          <SelectTrigger className="w-full min-w-28 sm:w-32" aria-label={t("whatsapp.defaultCurrency")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map((currency) => (
              <SelectItem key={currency} value={currency}>
                {t(currencyKey[currency])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
  ];
}

/**
 * รายชื่อกลุ่มที่บอทอ่านได้จากบัญชีนี้ — เลือกแม่หวยให้กลุ่มไหน บอทก็อ่านโพยกลุ่มนั้นเข้าแม่หวยนั้น
 * แต่ละกลุ่มเลือกตัวอ่านรูปโพยเองได้ (AI / บริการ OCR)
 */
export function GroupsView({ page, dealers }: { page: Paginated<WhatsappGroupRow>; dealers: DealerOption[] }) {
  const { t, intl } = useI18n();
  const { rows, isPending, mutate } = useOptimisticList(page.rows);

  const columns = React.useMemo(
    () =>
      getGroupColumns({
        t,
        intl,
        dealers,
        onAssign: (row, change) => {
          const next = { ...row, ...change };
          if (
            row.dealerId === next.dealerId &&
            row.lottery === next.lottery &&
            row.readImages === next.readImages &&
            row.threeDigitBottom === next.threeDigitBottom &&
            row.currency === next.currency
          ) {
            return;
          }
          mutate({
            patch: { type: "update", item: next },
            action: () =>
              assignWhatsappGroup({
                id: row.id,
                dealerId: next.dealerId,
                lottery: next.lottery,
                readImages: next.readImages,
                threeDigitBottom: next.threeDigitBottom,
                currency: next.currency,
              }),
          });
        },
      }),
    [t, intl, dealers, mutate],
  );

  return (
    <DataTable
      columns={columns}
      page={{ ...page, rows }}
      pending={isPending}
      searchPlaceholderKey="whatsapp.searchGroups"
      emptyTitleKey="whatsapp.noGroups"
      emptyDescriptionKey="whatsapp.noGroupsDesc"
    />
  );
}
