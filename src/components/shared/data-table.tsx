"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { buildQueryString, toRoute } from "@/lib/query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { TableSkeleton } from "@/components/shared/loading";
import { SearchInput } from "@/components/shared/search-input";
import { DataTablePagination, PageSizeSelect } from "@/components/shared/data-table-pagination";
import { useI18n } from "@/i18n/client";
import type { Paginated } from "@/types";

/**
 * ============================================================================
 * ตารางมาตรฐานของระบบ — แบ่งหน้า/ค้นหา/เรียง ที่ "ฐานข้อมูล" ทั้งหมด
 * ============================================================================
 * component นี้ไม่ถือข้อมูลเอง: มันอ่าน/เขียนสถานะผ่าน URL (?page, ?pageSize, ?q, ?sort, ?order)
 * แล้วปล่อยให้ server component ไปสั่ง Prisma ใหม่ — ฝั่ง client จึงได้ข้อมูลแค่หน้าเดียวเสมอ
 *
 * ให้คอลัมน์เรียงได้: ใส่ id ของคอลัมน์ให้ตรงกับชื่อ field ใน Prisma แล้วตั้ง enableSorting: true
 *
 * เลือกหลายแถว: ใส่ selectable + bulkActions — ตารางเติมคอลัมน์ checkbox ให้เอง
 * การเลือกมีผลเฉพาะหน้าปัจจุบัน (เปลี่ยนหน้า/ค้นหา/แถวถูกลบ → รายการที่ไม่อยู่ในหน้าแล้วหลุดออกเอง)
 */

/** สิ่งที่ bulkActions ได้รับ: แถวที่เลือก + ฟังก์ชันล้างการเลือก */
export type BulkActionContext<TData> = {
  rows: TData[];
  clear: () => void;
};

const SELECT_COLUMN_ID = "__select";

export type DataTableProps<TData extends { id: string }, TValue> = {
  columns: ColumnDef<TData, TValue>[];
  /** ข้อมูลหน้าปัจจุบัน + meta ที่ได้จาก paginate() */
  page: Paginated<TData>;
  /** คีย์ข้อความ (i18n) ของ placeholder ช่องค้นหา */
  searchPlaceholderKey?: string;
  /** ซ่อนช่องค้นหาเมื่อ module นั้นไม่ต้องการ */
  searchable?: boolean;
  toolbar?: React.ReactNode;
  loading?: boolean;
  /** กำลังรอผล optimistic — ตารางจะหรี่แสงแต่ยังกดได้ */
  pending?: boolean;
  emptyTitleKey?: string;
  emptyDescriptionKey?: string;
  /** แสดง checkbox หน้าแต่ละแถว + ช่องเลือกทั้งหมดที่หัวตาราง */
  selectable?: boolean;
  /** ปุ่มจัดการรายการที่เลือก — แสดงในแถบเหนือตารางเมื่อเลือกอย่างน้อย 1 แถว */
  bulkActions?: (ctx: BulkActionContext<TData>) => React.ReactNode;
};

export function DataTable<TData extends { id: string }, TValue>({
  columns,
  page,
  searchPlaceholderKey = "table.search",
  searchable = true,
  toolbar,
  loading = false,
  pending = false,
  emptyTitleKey = "table.empty",
  emptyDescriptionKey = "table.emptyDesc",
  selectable = false,
  bulkActions,
}: DataTableProps<TData, TValue>) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const sort = searchParams.get("sort") ?? "";
  const order = searchParams.get("order") === "asc" ? "asc" : "desc";

  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  // แถวที่ไม่อยู่ในหน้านี้แล้ว (เปลี่ยนหน้า/ค้นหา/ถูกลบ) ต้องหลุดจากการเลือก
  React.useEffect(() => {
    setRowSelection((prev) => {
      const ids = new Set(page.rows.map((row) => row.id));
      const kept = Object.keys(prev).filter((id) => prev[id] && ids.has(id));
      return kept.length === Object.keys(prev).length
        ? prev
        : Object.fromEntries(kept.map((id) => [id, true]));
    });
  }, [page.rows]);

  const allColumns = React.useMemo<ColumnDef<TData, TValue>[]>(() => {
    if (!selectable) return columns;

    const selectColumn: ColumnDef<TData, TValue> = {
      id: SELECT_COLUMN_ID,
      enableSorting: false,
      header: ({ table }) => (
        <Checkbox
          aria-label={t("table.selectAll")}
          checked={table.getIsAllRowsSelected()}
          indeterminate={table.getIsSomeRowsSelected()}
          disabled={table.getRowModel().rows.every((row) => !row.getCanSelect())}
          onCheckedChange={(checked) => table.toggleAllRowsSelected(checked)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label={t("table.selectRow")}
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onCheckedChange={(checked) => row.toggleSelected(checked)}
        />
      ),
    };

    return [selectColumn, ...columns];
  }, [columns, selectable, t]);

  const table = useReactTable({
    data: page.rows,
    columns: allColumns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    pageCount: page.pageCount,
    getRowId: (row) => row.id,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    // แถวที่ยังรอผลจากฐานข้อมูล (id ชั่วคราว) ยังเลือกไม่ได้
    enableRowSelection: (row) => selectable && !(row.original as { __optimistic?: string }).__optimistic,
  });

  const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original);
  const clearSelection = React.useCallback(() => setRowSelection({}), []);

  function toggleSort(columnId: string) {
    const nextOrder = sort === columnId && order === "asc" ? "desc" : "asc";
    const qs = buildQueryString(searchParams, { sort: columnId, order: nextOrder, page: 1 });
    router.push(toRoute(`${pathname}?${qs}`), { scroll: false });
  }

  if (loading) return <TableSkeleton columns={allColumns.length} />;

  return (
    <div className="space-y-4">
      {/* แถบบน: [จำนวนต่อหน้า + ช่องค้นหา] อยู่แถวเดียวกันเสมอ แล้วตามด้วยปุ่มของ module */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <PageSizeSelect pageSize={page.pageSize} disabled={pending} />
          {searchable ? <SearchInput placeholderKey={searchPlaceholderKey} /> : null}
        </div>
        {toolbar ? (
          <div className="[&>button]:w-full sm:ml-auto sm:[&>button]:w-auto">{toolbar}</div>
        ) : null}
      </div>

      {/* แถบจัดการรายการที่เลือก — โผล่เมื่อเลือกอย่างน้อย 1 แถว */}
      {selectable && selectedRows.length > 0 ? (
        <div
          role="region"
          aria-label={t("table.selectedActions")}
          className="animate-in-up flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2"
        >
          <p className="text-sm font-medium" aria-live="polite">
            {t("table.selected", { count: selectedRows.length })}
          </p>
          <Button variant="ghost" size="sm" onClick={clearSelection} disabled={pending}>
            <X /> {t("table.clearSelection")}
          </Button>
          {bulkActions ? (
            <div className="ml-auto flex items-center gap-2">
              {bulkActions({ rows: selectedRows, clear: clearSelection })}
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(
          "overflow-hidden rounded-xl border transition-opacity",
          pending && "opacity-70",
        )}
        aria-busy={pending}
      >
        <Table>
          <TableHeader className="bg-muted/40">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sortable = header.column.columnDef.enableSorting === true;
                  const active = sort === header.column.id;

                  return (
                    <TableHead
                      key={header.id}
                      className={cn(header.column.id === SELECT_COLUMN_ID && "w-10 pr-0")}
                    >
                      {header.isPlaceholder ? null : sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(header.column.id)}
                          className={cn(
                            "inline-flex items-center gap-1 transition-colors hover:text-foreground",
                            active && "text-foreground",
                          )}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {active ? (
                            order === "asc" ? (
                              <ArrowUp className="size-3" />
                            ) : (
                              <ArrowDown className="size-3" />
                            )
                          ) : (
                            <ArrowUpDown className="size-3 opacity-50" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => {
                // แถวที่ยังรอผลจากฐานข้อมูลจะถูกติดธงไว้โดย useOptimisticList
                const optimistic = (row.original as { __optimistic?: string }).__optimistic;

                return (
                  <TableRow
                    key={row.id}
                    data-optimistic={optimistic}
                    data-state={row.getIsSelected() ? "selected" : undefined}
                    className={cn(
                      "animate-in-up data-[state=selected]:bg-primary/5",
                      optimistic && "pointer-events-none opacity-55 italic",
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(cell.column.id === SELECT_COLUMN_ID && "w-10 pr-0")}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={allColumns.length} className="p-0">
                  <EmptyState
                    title={t(emptyTitleKey)}
                    description={t(emptyDescriptionKey)}
                    className="border-0"
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <DataTablePagination meta={page} disabled={pending} />
    </div>
  );
}
