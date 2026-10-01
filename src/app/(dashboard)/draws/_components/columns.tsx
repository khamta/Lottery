"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ChartColumn, EllipsisVertical, Lock, LockOpen, Pencil, Trash2 } from "lucide-react";

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
import { toRoute } from "@/lib/query";
import { formatDate } from "@/lib/utils";
import { statusKey, type DrawRow } from "../types";

type ColumnOptions = {
  /** ตัวแปลจาก useI18n() — คอลัมน์ไม่เรียก hook เอง เพราะถูกสร้างนอก render tree */
  t: (key: string, params?: Record<string, string | number>) => string;
  intl: string;
  onEdit: (row: DrawRow) => void;
  /** ปิดรับ / เปิดรับอีกครั้ง — งวดที่ออกผลแล้วไม่มีตัวเลือกนี้ */
  onSetStatus: (row: DrawRow, status: "OPEN" | "CLOSED") => void;
  onDelete: (row: DrawRow) => void;
};

const statusVariant = {
  OPEN: "success",
  CLOSED: "warning",
  SETTLED: "secondary",
} as const;

export function getDrawColumns({ t, intl, onEdit, onSetStatus, onDelete }: ColumnOptions): ColumnDef<DrawRow>[] {
  return [
    {
      id: "name",
      accessorKey: "name",
      header: t("draws.name"),
      enableSorting: true,
      cell: ({ row }) => <p className="min-w-32 font-medium">{row.original.name}</p>,
    },
    {
      id: "drawDate",
      accessorKey: "drawDate",
      header: t("draws.drawDate"),
      enableSorting: true,
      cell: ({ row }) => (
        <span className="whitespace-nowrap">{formatDate(row.original.drawDate, intl, "date")}</span>
      ),
    },
    {
      id: "status",
      accessorKey: "status",
      header: t("draws.status"),
      enableSorting: true,
      cell: ({ row }) => (
        <Badge variant={statusVariant[row.original.status]}>{t(statusKey[row.original.status])}</Badge>
      ),
    },
    {
      id: "result",
      enableSorting: false,
      header: t("draws.result"),
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">
          {row.original.topResult ?? "–"} · {row.original.bottomResult ?? "–"}
        </span>
      ),
    },
    {
      id: "ticketCount",
      enableSorting: false,
      header: t("draws.ticketCount"),
      cell: ({ row }) => <span className="tabular-nums">{row.original.ticketCount.toLocaleString(intl)}</span>,
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
              <DropdownMenuItem asChild>
                <Link href={toRoute(`/reports?draw=${row.original.id}`)}>
                  <ChartColumn /> {t("draws.viewReport")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEdit(row.original)}>
                <Pencil /> {t("common.edit")}
              </DropdownMenuItem>
              {row.original.status === "OPEN" ? (
                <DropdownMenuItem onClick={() => onSetStatus(row.original, "CLOSED")}>
                  <Lock /> {t("draws.close")}
                </DropdownMenuItem>
              ) : row.original.status === "CLOSED" ? (
                <DropdownMenuItem onClick={() => onSetStatus(row.original, "OPEN")}>
                  <LockOpen /> {t("draws.reopen")}
                </DropdownMenuItem>
              ) : null}
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
