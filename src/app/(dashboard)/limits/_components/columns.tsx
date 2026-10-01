"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { EllipsisVertical, Pencil, Trash2 } from "lucide-react";

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
import { formatDate } from "@/lib/utils";
import { currencyKey, digitsKey, positionKey, type LimitRow } from "../types";

type ColumnOptions = {
  /** ตัวแปลจาก useI18n() — คอลัมน์ไม่เรียก hook เอง เพราะถูกสร้างนอก render tree */
  t: (key: string, params?: Record<string, string | number>) => string;
  intl: string;
  onEdit: (row: LimitRow) => void;
  onDelete: (row: LimitRow) => void;
};

export function getLimitColumns({ t, intl, onEdit, onDelete }: ColumnOptions): ColumnDef<LimitRow>[] {
  return [
    {
      id: "digits",
      accessorKey: "digits",
      header: t("limits.digits"),
      enableSorting: true,
      cell: ({ row }) => <span className="whitespace-nowrap">{t(digitsKey[row.original.digits] ?? "lottery.digits2")}</span>,
    },
    {
      id: "number",
      accessorKey: "number",
      header: t("limits.number"),
      enableSorting: true,
      cell: ({ row }) =>
        row.original.number ? (
          <span className="font-semibold tabular-nums">{row.original.number}</span>
        ) : (
          <Badge variant="secondary">{t("limits.allNumbers")}</Badge>
        ),
    },
    {
      id: "position",
      accessorKey: "position",
      header: t("limits.position"),
      enableSorting: true,
      cell: ({ row }) => t(positionKey[row.original.position]),
    },
    {
      id: "currency",
      accessorKey: "currency",
      header: t("limits.currency"),
      enableSorting: true,
      cell: ({ row }) => t(currencyKey[row.original.currency]),
    },
    {
      id: "maxAmount",
      accessorKey: "maxAmount",
      header: t("limits.maxAmount"),
      enableSorting: true,
      cell: ({ row }) =>
        row.original.maxAmount === 0 ? (
          <Badge variant="destructive">{t("limits.closed")}</Badge>
        ) : (
          <span className="font-medium tabular-nums">{row.original.maxAmount.toLocaleString(intl)}</span>
        ),
    },
    {
      id: "updatedAt",
      accessorKey: "updatedAt",
      header: t("limits.updatedAt"),
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
