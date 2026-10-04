"use client";

import * as React from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/shared/data-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useOptimisticList } from "@/hooks/use-optimistic-list";
import { useI18n } from "@/i18n/client";
import type { ImageEngineValue, TicketInput } from "@/lib/validations/ticket";
import { DEFAULT_LAK_MULTIPLIER, parseTicket } from "@/lottery/parser";
import type { ReadRuleSpec } from "@/lottery/read-rules";
import { summarizeTicket } from "@/lottery/ticket";
import type { Paginated } from "@/types";
import {
  createTicket,
  deleteTicket,
  deleteTickets,
  editTicketImage,
  rereadDrawImages,
  rereadTicketImage,
  updateTicket,
} from "../actions";
import {
  canRereadImage,
  type CustomerOption,
  type DrawOption,
  type RereadDrawTarget,
  type TicketFilterValues,
  type TicketRow,
} from "../types";
import { getTicketColumns } from "./columns";
import { TicketDialog } from "./ticket-dialog";
import { RereadImageDialog } from "./reread-image-dialog";
import { ImageEditorDialog, type EditedImageData } from "./image-editor-dialog";
import { TicketFilters } from "./ticket-filters";

/** สิ่งที่จะอ่านรูปใหม่: โพยใบเดียว (ทุกคน) · โพยใบเดียวด้วยรูปที่เพิ่งแก้ (ทุกคน) · โพยรอตรวจทั้งงวด (ผู้ดูแลระบบ) */
type RereadTarget =
  | { kind: "ticket"; row: TicketRow }
  | { kind: "edited"; row: TicketRow; image: EditedImageData }
  | { kind: "draw"; draw: RereadDrawTarget };

/** กดตรงนี้ในแถว = ใช้งานปุ่ม/checkbox/เมนูนั้น ไม่ใช่เปิดหน้าตรวจโพย */
const INTERACTIVE = "button, a, input, label, [role='checkbox'], [role='menuitem']";

export function TicketsView({
  page,
  draws,
  customers,
  rules,
  filters,
  oddLakCount,
  rereadDraw,
}: {
  page: Paginated<TicketRow>;
  draws: DrawOption[];
  customers: CustomerOption[];
  /** เงื่อนไขอ่านโพยของแม่หวย (read-rules.ts) */
  rules: ReadRuleSpec[];
  filters: TicketFilterValues;
  /** จำนวนโพยที่มียอดกีบแปลก (ไม่ลงท้าย 000) ในงวดที่กรองอยู่ */
  oddLakCount: number;
  /** ผู้ดูแลระบบ + กรองงวดที่เปิดรับอยู่ = ปุ่มอ่านรูปโพยรอตรวจทั้งงวดใหม่ (null = ไม่แสดงปุ่ม) */
  rereadDraw: RereadDrawTarget | null;
}) {
  const { t, intl } = useI18n();
  const { rows, isPending, mutate, tempId } = useOptimisticList(page.rows);

  const [selected, setEditing] = React.useState<TicketRow | null>(null);
  // ข้อมูลล่าสุดของโพยที่เปิดอยู่ — หน้า refresh เองระหว่างรออ่านรูป หน้าต่างจึงเห็นข้อความที่อ่านจากรูปทันทีที่เสร็จ
  const editing = selected ? (rows.find((row) => row.id === selected.id) ?? selected) : null;
  const [formOpen, setFormOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<TicketRow | null>(null);
  // รายการที่เลือกด้วย checkbox แล้วกด "ลบที่เลือก" (clear = ล้าง checkbox หลังยืนยัน)
  const [bulkDeleting, setBulkDeleting] = React.useState<{
    rows: TicketRow[];
    clear: () => void;
  } | null>(null);

  // อ่านรูปใหม่: เลือกตัวอ่าน (rereading) → เลือก AI ต้องยืนยันค่าใช้จ่ายอีกขั้น (aiConfirm) → สั่งจริง
  const [rereading, setRereading] = React.useState<RereadTarget | null>(null);
  const [aiConfirm, setAiConfirm] = React.useState<RereadTarget | null>(null);
  // แก้รูป (ครอป / ยางลบ) → เลือกตัวอ่าน (rereading kind "edited") → สั่งบันทึกรูป + อ่านใหม่
  const [editingImage, setEditingImage] = React.useState<TicketRow | null>(null);

  const openReview = React.useCallback((row: TicketRow) => {
    setEditing(row);
    setFormOpen(true);
  }, []);

  const columns = React.useMemo(
    () =>
      getTicketColumns({
        t,
        intl,
        onEdit: openReview,
        onReread: (row) => setRereading({ kind: "ticket", row }),
        onEditImage: setEditingImage,
        onDelete: (row) => setDeleting(row),
      }),
    [t, intl, openReview],
  );

  /** กดที่แถวของตาราง (นอกปุ่ม/checkbox/เมนู) = เปิดหน้าตรวจโพยใบนั้นเลย — ลากเลือกข้อความไม่นับ */
  function handleRowClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest(INTERACTIVE) || window.getSelection()?.toString()) return;
    const id = target.closest("tbody tr")?.querySelector<HTMLElement>("[data-ticket-id]")?.dataset.ticketId;
    const row = id ? rows.find((item) => item.id === id) : undefined;
    if (row) openReview(row);
  }

  function describeReread(target: RereadTarget) {
    if (target.kind === "ticket") {
      return t("tickets.rereadDesc", { bill: target.row.billNo ?? "–" });
    }
    if (target.kind === "edited") {
      return t("tickets.editImageRereadDesc", { bill: target.row.billNo ?? "–" });
    }
    const { drawName, count, limit } = target.draw;
    const desc = t("tickets.rereadDrawDesc", { count, draw: drawName });
    return count > limit ? `${desc} ${t("tickets.rereadDrawLimit", { limit })}` : desc;
  }

  /** จำนวนรูปที่จะอ่าน — บอกในคำเตือนค่าใช้จ่ายของ AI */
  const imageCount = (target: RereadTarget) =>
    target.kind === "draw" ? Math.min(target.draw.count, target.draw.limit) : 1;

  function handleRereadEngine(engine: ImageEngineValue) {
    const target = rereading;
    setRereading(null);
    if (!target) return;
    if (engine === "AI") setAiConfirm(target);
    else runReread(target, engine);
  }

  function runReread(target: RereadTarget, engine: ImageEngineValue) {
    if (target.kind === "ticket") {
      mutate({
        patch: { type: "update", item: { ...target.row, ocrStatus: "PENDING" } },
        action: () => rereadTicketImage({ id: target.row.id, engine }),
      });
      return;
    }
    if (target.kind === "edited") {
      const { row, image } = target;
      mutate({
        patch: { type: "update", item: { ...row, ocrStatus: "PENDING" } },
        action: () => editTicketImage({ id: row.id, engine, ...image }),
      });
      return;
    }
    // ทั้งงวด: แถวที่เห็นอยู่ขึ้น "รอคิวอ่าน" ได้ทีละแถว (patch เดียว) — แถวแรกที่จะถูกอ่าน · ไม่มีในหน้านี้ = ไม่ต้องเปลี่ยนอะไรบนจอ
    const first = rows.find(canRereadImage);
    mutate({
      patch: first ? { type: "update", item: { ...first, ocrStatus: "PENDING" } } : { type: "delete-many", ids: [] },
      action: () => rereadDrawImages({ drawId: target.draw.drawId, engine }),
    });
  }

  function handleSave(values: TicketInput) {
    // แยกข้อความฝั่ง client ด้วยตัวแยกชุดเดียวกับ server เพื่อให้แถวขึ้นยอดทันที
    const customer = customers.find((option) => option.id === values.customerId) ?? null;
    const lakMultiplier = customer?.lakMultiplier ?? DEFAULT_LAK_MULTIPLIER;
    const summary = summarizeTicket(parseTicket(values.text, { lakMultiplier, rules }), values.force);

    const shared = {
      drawId: values.drawId,
      drawName: draws.find((draw) => draw.id === values.drawId)?.name ?? "",
      customerId: customer?.id ?? null,
      customerName: customer?.name ?? null,
      status: summary.status,
      rawText: values.text,
      lakMultiplier,
      note: values.note || null,
      issueCount: summary.issues.length,
      betCount: summary.betCount,
      totalLak: summary.totalLak,
      totalThb: summary.totalThb,
    };
    // อ่านได้ไม่ครบ → บอกชัด ๆ ว่าโพยยังไม่ถูกนับยอด
    const successMessage = summary.status === "REVIEW" ? t("tickets.savedForReview") : undefined;

    if (editing) {
      mutate({
        patch: { type: "update", item: { ...editing, ...shared } },
        action: () => updateTicket({ ...values, id: editing.id }),
        successMessage,
      });
    } else {
      mutate({
        patch: {
          type: "create",
          item: {
            id: tempId(),
            billNo: null, // server ออกเลขให้ตอนบันทึก
            source: "MANUAL",
            senderName: null,
            ocrStatus: null,
            ocrTranscript: null,
            imageEditedAt: null,
            createdAt: new Date().toISOString(),
            ...shared,
          },
        },
        action: () => createTicket(values),
        successMessage,
      });
    }

    setFormOpen(false); // ปิดทันที ไม่รอ database
  }

  function handleDelete(row: TicketRow) {
    mutate({
      patch: { type: "delete", id: row.id },
      action: () => deleteTicket({ id: row.id }),
    });
    setDeleting(null);
  }

  function handleBulkDelete({ rows: selected, clear }: { rows: TicketRow[]; clear: () => void }) {
    const ids = selected.map((row) => row.id);
    mutate({
      patch: { type: "delete-many", ids },
      action: () => deleteTickets({ ids }),
      successMessage: t("tickets.deletedMany", { count: ids.length }),
    });
    clear();
    setBulkDeleting(null);
  }

  const filtered = !!filters.status || filters.oddLak;

  return (
    <>
      {/* กดที่แถว = เปิดหน้าตรวจโพย (ตารางกลางรับ onClick ของแถวไม่ได้ จึงดักที่กรอบนอก) */}
      <div onClick={handleRowClick} className="[&_tbody_tr:has([data-ticket-id])]:cursor-pointer">
        <DataTable
          columns={columns}
          page={{ ...page, rows }}
          pending={isPending}
          searchPlaceholderKey="tickets.search"
          emptyTitleKey={filtered ? "tickets.emptyFiltered" : "tickets.empty"}
          emptyDescriptionKey={filtered ? "tickets.emptyFilteredDesc" : "tickets.emptyDesc"}
          selectable
          bulkActions={(ctx) => (
            <Button variant="destructive" size="sm" onClick={() => setBulkDeleting(ctx)}>
              <Trash2 /> {t("common.deleteSelected")}
            </Button>
          )}
          toolbar={
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <TicketFilters draws={draws} filters={filters} oddLakCount={oddLakCount} disabled={isPending} />
              {rereadDraw ? (
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  disabled={isPending || rereadDraw.count === 0}
                  onClick={() => setRereading({ kind: "draw", draw: rereadDraw })}
                >
                  <RefreshCw /> {t("tickets.rereadDraw", { count: rereadDraw.count })}
                </Button>
              ) : null}
              <Button
                className="w-full sm:w-auto"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus /> {t("tickets.add")}
              </Button>
            </div>
          }
        />
      </div>

      <TicketDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        ticket={editing}
        draws={draws}
        customers={customers}
        rules={rules}
        defaultDrawId={filters.drawId}
        onSubmit={handleSave}
        onEditImage={setEditingImage}
      />

      <ImageEditorDialog
        ticket={editingImage}
        onOpenChange={(open) => !open && setEditingImage(null)}
        onSubmit={(image) => {
          const row = editingImage;
          setEditingImage(null);
          if (row) setRereading({ kind: "edited", row, image });
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("tickets.deleteTitle")}
        description={t("tickets.deleteDesc")}
        confirmText={t("tickets.deleteConfirm")}
        onConfirm={() => {
          if (deleting) handleDelete(deleting);
        }}
      />

      <RereadImageDialog
        description={rereading ? describeReread(rereading) : null}
        onOpenChange={(open) => !open && setRereading(null)}
        onSubmit={handleRereadEngine}
      />

      {/* AI มีค่าใช้จ่ายต่อรูป — ยืนยันอีกขั้นทุกครั้ง ทั้งใบเดียวและทั้งงวด */}
      <ConfirmDialog
        open={!!aiConfirm}
        onOpenChange={(open) => !open && setAiConfirm(null)}
        variant="default"
        title={t("tickets.aiConfirmTitle")}
        description={aiConfirm ? t("tickets.aiConfirmDesc", { count: imageCount(aiConfirm) }) : undefined}
        confirmText={t("tickets.aiConfirm")}
        onConfirm={() => {
          if (aiConfirm) runReread(aiConfirm, "AI");
          setAiConfirm(null);
        }}
      />

      <ConfirmDialog
        open={!!bulkDeleting}
        onOpenChange={(open) => !open && setBulkDeleting(null)}
        title={t("tickets.deleteTitle")}
        description={t("tickets.bulkDeleteDesc", { count: bulkDeleting?.rows.length ?? 0 })}
        confirmText={t("tickets.bulkDeleteConfirm", { count: bulkDeleting?.rows.length ?? 0 })}
        onConfirm={() => {
          if (bulkDeleting) handleBulkDelete(bulkDeleting);
        }}
      />
    </>
  );
}
