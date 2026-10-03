"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardCheck, EllipsisVertical, ImageIcon, Trash2 } from "lucide-react";

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
import { formatNumber } from "@/lottery/format";
import { ocrStatusKey, sourceKey, statusKey, type TicketRow } from "../types";

type ColumnOptions = {
  /** ตัวแปลจาก useI18n() — คอลัมน์ไม่เรียก hook เอง เพราะถูกสร้างนอก render tree */
  t: (key: string, params?: Record<string, string | number>) => string;
  intl: string;
  onEdit: (row: TicketRow) => void;
  onDelete: (row: TicketRow) => void;
};

export function getTicketColumns({ t, intl, onEdit, onDelete }: ColumnOptions): ColumnDef<TicketRow>[] {
  const money = (value: number) =>
    value ? <span className="font-medium tabular-nums">{formatNumber(value, intl)}</span> : <span className="text-muted-foreground">–</span>;

  return [
    {
      id: "billNo",
      accessorKey: "billNo",
      header: t("tickets.billNo"),
      enableSorting: true,
      cell: ({ row }) =>
        row.original.billNo === null ? (
          <span className="text-muted-foreground">–</span>
        ) : (
          <span className="font-medium whitespace-nowrap tabular-nums">{row.original.billNo}</span>
        ),
    },
    {
      id: "createdAt",
      accessorKey: "createdAt",
      header: t("tickets.createdAt"),
      enableSorting: true,
      cell: ({ row }) => (
        <div className="whitespace-nowrap">
          <p className="text-sm">{formatDate(row.original.createdAt, intl)}</p>
          <p className="text-xs text-muted-foreground">
            {row.original.drawName} · {t(sourceKey[row.original.source])}
          </p>
        </div>
      ),
    },
    {
      id: "customer",
      enableSorting: false,
      header: t("tickets.customer"),
      cell: ({ row }) => {
        const { customerName, senderName, note } = row.original;
        return (
          <div className="min-w-28">
            {customerName ? (
              <p className="font-medium">{customerName}</p>
            ) : (
              <p className="text-muted-foreground">{senderName ?? t("tickets.noCustomer")}</p>
            )}
            {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
          </div>
        );
      },
    },
    {
      id: "rawText",
      enableSorting: false,
      header: t("tickets.text"),
      cell: ({ row }) => {
        const { rawText, ocrStatus } = row.original;
        return (
          <div className="max-w-64 min-w-40">
            {ocrStatus ? (
              // โพยจากรูป — สถานะการอ่านรูปด้วย OCR
              <p
                className={`mb-1 flex items-center gap-1 text-xs font-medium ${ocrStatus === "FAILED" ? "text-destructive" : "text-muted-foreground"}`}
              >
                <ImageIcon className="size-3.5" /> {t(ocrStatusKey[ocrStatus])}
              </p>
            ) : null}
            {rawText ? (
              <p className="line-clamp-3 text-sm break-words whitespace-pre-line tabular-nums">{rawText}</p>
            ) : ocrStatus ? null : (
              // ข้อความว่าง = บอทถอดรหัสข้อความ WhatsApp นี้ไม่ได้ ต้องดูในแชตแล้ววางเอง
              <p className="text-sm font-medium text-destructive">{t("tickets.undecrypted")}</p>
            )}
          </div>
        );
      },
    },
    {
      id: "betCount",
      accessorKey: "betCount",
      header: t("tickets.betCount"),
      enableSorting: true,
      cell: ({ row }) => <span className="tabular-nums">{formatNumber(row.original.betCount, intl)}</span>,
    },
    {
      id: "totalLak",
      accessorKey: "totalLak",
      header: t("tickets.totalLak"),
      enableSorting: true,
      cell: ({ row }) => money(row.original.totalLak),
    },
    {
      id: "totalThb",
      accessorKey: "totalThb",
      header: t("tickets.totalThb"),
      enableSorting: true,
      cell: ({ row }) => money(row.original.totalThb),
    },
    {
      id: "status",
      accessorKey: "status",
      header: t("tickets.status"),
      enableSorting: true,
      cell: ({ row }) =>
        row.original.status === "REVIEW" ? (
          <Badge variant="warning">
            {t(statusKey.REVIEW)}
            {row.original.issueCount ? ` (${row.original.issueCount})` : ""}
          </Badge>
        ) : (
          <Badge variant="success">{t(statusKey.CONFIRMED)}</Badge>
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
                <ClipboardCheck /> {t("tickets.review")}
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
