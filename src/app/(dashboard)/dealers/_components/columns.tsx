"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Check, EllipsisVertical, Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, formatDate } from "@/lib/utils";
import { formatNumber } from "@/lottery/format";
import type { DealerRow } from "../types";

type ColumnOptions = {
  /** ตัวแปลจาก useI18n() — คอลัมน์ไม่เรียก hook เอง เพราะถูกสร้างนอก render tree */
  t: (key: string, params?: Record<string, string | number>) => string;
  intl: string;
  currentId: string | null;
  showOwner: boolean;
  onSelect: (row: DealerRow) => void;
  onEdit: (row: DealerRow) => void;
  onDelete: (row: DealerRow) => void;
  /** สวิตช์หลักอ่านรูปด้วย AI ของทั้งแม่หวย */
  onToggleReadImages: (row: DealerRow) => void;
};

/** สวิตช์เปิด/ปิด — components/ui ไม่มี Switch (เป็นไฟล์ core ของ template) จึงทำจาก button + role="switch" */
function ReadImagesSwitch({ row, t, onToggle }: { row: DealerRow; t: ColumnOptions["t"]; onToggle: () => void }) {
  const on = row.readImages;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={t("dealers.readImages")}
      title={t("dealers.readImagesHint")}
      onClick={onToggle}
      className="group inline-flex items-center gap-2 rounded-md text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
      <span className={on ? "font-medium" : "text-muted-foreground"}>
        {t(on ? "dealers.readImagesOn" : "dealers.readImagesOff")}
      </span>
    </button>
  );
}

export function getDealerColumns({
  t,
  intl,
  currentId,
  showOwner,
  onSelect,
  onEdit,
  onDelete,
  onToggleReadImages,
}: ColumnOptions): ColumnDef<DealerRow>[] {
  const count = (value: number) => <span className="tabular-nums">{formatNumber(value, intl)}</span>;

  const owner: ColumnDef<DealerRow>[] = showOwner
    ? [
        {
          id: "owner",
          header: t("dealers.owner"),
          enableSorting: false,
          cell: ({ row }) =>
            row.original.ownerName ? (
              <span className="text-sm">{row.original.ownerName}</span>
            ) : (
              <Badge variant="secondary">{t("dealers.ownerMe")}</Badge>
            ),
        },
      ]
    : [];

  return [
    {
      id: "name",
      accessorKey: "name",
      header: t("dealers.name"),
      enableSorting: true,
      cell: ({ row }) => (
        <div className="min-w-40 space-y-0.5">
          <p className="flex items-center gap-2 font-medium">
            {row.original.name}
            {row.original.id === currentId ? <Badge variant="success">{t("dealers.inUse")}</Badge> : null}
          </p>
          {row.original.note ? <p className="text-xs text-muted-foreground">{row.original.note}</p> : null}
        </div>
      ),
    },
    ...owner,
    {
      id: "drawCount",
      header: t("dealers.draws"),
      enableSorting: false,
      cell: ({ row }) => count(row.original.drawCount),
    },
    {
      id: "customerCount",
      header: t("dealers.customers"),
      enableSorting: false,
      cell: ({ row }) => count(row.original.customerCount),
    },
    {
      id: "groupCount",
      header: t("dealers.groups"),
      enableSorting: false,
      cell: ({ row }) => count(row.original.groupCount),
    },
    {
      id: "readImages",
      header: t("dealers.readImages"),
      enableSorting: false,
      cell: ({ row }) => (
        <ReadImagesSwitch row={row.original} t={t} onToggle={() => onToggleReadImages(row.original)} />
      ),
    },
    {
      id: "updatedAt",
      accessorKey: "updatedAt",
      header: t("dealers.updatedAt"),
      enableSorting: true,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.original.updatedAt, intl)}</span>
      ),
    },
    {
      id: "actions",
      enableSorting: false,
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t("table.rowMenu")}>
                <EllipsisVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t("common.manage")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={row.original.id === currentId} onClick={() => onSelect(row.original)}>
                <Check /> {t("dealers.use")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEdit(row.original)}>
                <Pencil /> {t("common.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => onDelete(row.original)}>
                <Trash2 /> {t("common.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];
}
