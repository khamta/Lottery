"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ArrowRight, EllipsisVertical, Pencil, Power, Trash2 } from "lucide-react";

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
import { kindKey, type ReadRuleRow } from "../types";

type ColumnOptions = {
  /** ตัวแปลจาก useI18n() — คอลัมน์ไม่เรียก hook เอง เพราะถูกสร้างนอก render tree */
  t: (key: string, params?: Record<string, string | number>) => string;
  intl: string;
  onEdit: (row: ReadRuleRow) => void;
  onToggle: (row: ReadRuleRow) => void;
  onDelete: (row: ReadRuleRow) => void;
};

const kindVariant = { SKIP: "outline", REPLACE: "secondary", PATTERN: "default" } as const;

export function getReadRuleColumns({ t, intl, onEdit, onToggle, onDelete }: ColumnOptions): ColumnDef<ReadRuleRow>[] {
  return [
    {
      id: "kind",
      accessorKey: "kind",
      header: t("readRules.kind"),
      enableSorting: true,
      cell: ({ row }) => (
        <Badge variant={kindVariant[row.original.kind]} className="whitespace-nowrap">
          {t(kindKey[row.original.kind])}
        </Badge>
      ),
    },
    {
      id: "find",
      accessorKey: "find",
      header: t("readRules.rule"),
      enableSorting: true,
      cell: ({ row }) => (
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2 font-mono text-sm">
            <span className="whitespace-pre-line break-all rounded bg-muted px-1.5 py-0.5">{row.original.find}</span>
            {row.original.kind !== "SKIP" ? (
              <>
                <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="break-all rounded bg-muted px-1.5 py-0.5">
                  {row.original.replace || t("readRules.removeText")}
                </span>
              </>
            ) : null}
          </div>
          {row.original.note ? <span className="text-xs text-muted-foreground">{row.original.note}</span> : null}
        </div>
      ),
    },
    {
      id: "isActive",
      accessorKey: "isActive",
      header: t("readRules.status"),
      enableSorting: true,
      cell: ({ row }) =>
        row.original.isActive ? (
          <Badge variant="success">{t("readRules.active")}</Badge>
        ) : (
          <Badge variant="outline">{t("readRules.inactive")}</Badge>
        ),
    },
    {
      id: "updatedAt",
      accessorKey: "updatedAt",
      header: t("readRules.updatedAt"),
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
              <DropdownMenuItem onClick={() => onToggle(row.original)}>
                <Power /> {row.original.isActive ? t("readRules.deactivate") : t("readRules.activate")}
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
