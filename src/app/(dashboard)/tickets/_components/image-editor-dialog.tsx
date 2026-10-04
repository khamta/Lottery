"use client";

import * as React from "react";
import { Crop, Eraser, History, RotateCw, ScanText, Undo2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";
import type { EditedImageMime } from "@/lib/validations/ticket";
import { ticketImageUrl, type TicketRow } from "../types";

/** รูปที่แก้เสร็จ — base64 (ไม่มี data: นำหน้า) ส่งต่อให้ view สั่ง editTicketImage */
export type EditedImageData = { data: string; mimeType: EditedImageMime };

type Tool = "crop" | "erase";
type Rect = { x: number; y: number; w: number; h: number };
type Point = { x: number; y: number };

/** ด้านยาวของรูปที่ส่งไปอ่าน — ใหญ่กว่านี้ย่อลง (ตัวอ่านไม่ได้แม่นขึ้น แต่ไฟล์ใหญ่และส่งช้า) */
const MAX_SIDE = 2400;
/** ย้อนกลับได้กี่ขั้น — แต่ละขั้นเก็บรูปทั้งรูปไว้ในหน่วยความจำ */
const HISTORY_MAX = 20;
/** ยางลบระบายเป็นสีขาว = สีกระดาษโพย · เส้นกรอบครอปเป็นสีขาวบนพื้นมืด — วาดบน canvas ใช้ token ของ Tailwind ไม่ได้ */
const ERASE_COLOR = "#ffffff";
const BRUSH_SIZES = { min: 8, max: 80, initial: 28 };

function cloneCanvas(source: HTMLCanvasElement, width = source.width, height = source.height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * แก้รูปโพยก่อนสั่งอ่านใหม่: ครอปให้เหลือเฉพาะส่วนโพย · ยางลบลบสิ่งที่ไม่เกี่ยว (ขีดฆ่า ลายเซ็น เงา) · หมุนรูป
 * ไม่เรียก action เอง — ส่งรูปที่แก้ออกทาง onSubmit แล้ว view ให้เลือกตัวอ่านต่อ · เปิดเมื่อ ticket ไม่เป็น null
 * ทุกอย่างทำบน canvas ในเบราว์เซอร์ รูปที่ server ได้คือรูปที่เห็นบนจอ (JPEG)
 */
export function ImageEditorDialog({
  ticket,
  onOpenChange,
  onSubmit,
}: {
  ticket: TicketRow | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (image: EditedImageData) => void;
}) {
  const { t } = useI18n();
  const open = ticket !== null;

  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  /** รูปที่กำลังแก้ (ขนาดจริง) — canvas บนจอเป็นแค่ภาพของอันนี้ + กรอบครอป */
  const workRef = React.useRef<HTMLCanvasElement | null>(null);
  const historyRef = React.useRef<HTMLCanvasElement[]>([]);
  const cropRef = React.useRef<Rect | null>(null);
  const dragRef = React.useRef<{ start: Point; last: Point } | null>(null);

  const [tool, setTool] = React.useState<Tool>("crop");
  const [brush, setBrush] = React.useState(BRUSH_SIZES.initial);
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">("loading");
  const [crop, setCrop] = React.useState<Rect | null>(null);
  const [undoCount, setUndoCount] = React.useState(0);
  /** มีอะไรเปลี่ยนจากรูปปัจจุบันของโพยไหม — ไม่เปลี่ยน = ไม่มีอะไรให้บันทึก */
  const [changed, setChanged] = React.useState(false);

  const render = React.useCallback(() => {
    const canvas = canvasRef.current;
    const work = workRef.current;
    if (!canvas || !work) return;
    if (canvas.width !== work.width || canvas.height !== work.height) {
      canvas.width = work.width;
      canvas.height = work.height;
    }
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(work, 0, 0);

    const rect = cropRef.current;
    if (!rect) return;
    // หรี่ส่วนที่จะถูกตัดทิ้ง แล้วตีกรอบส่วนที่เก็บไว้
    const scale = work.width / (canvas.getBoundingClientRect().width || work.width);
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.beginPath();
    ctx.rect(0, 0, work.width, work.height);
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.fill("evenodd");
    ctx.strokeStyle = ERASE_COLOR;
    ctx.lineWidth = 2 * scale;
    ctx.setLineDash([8 * scale, 6 * scale]);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
  }, []);

  const load = React.useCallback(
    (src: string, isChange: boolean) => {
      setStatus("loading");
      const image = new Image();
      image.onload = () => {
        const work = document.createElement("canvas");
        work.width = image.naturalWidth;
        work.height = image.naturalHeight;
        const ctx = work.getContext("2d")!;
        // รูปโปร่งใส (PNG) → พื้นขาวเหมือนกระดาษ ไม่ใช่ดำตอนแปลงเป็น JPEG
        ctx.fillStyle = ERASE_COLOR;
        ctx.fillRect(0, 0, work.width, work.height);
        ctx.drawImage(image, 0, 0);
        workRef.current = work;
        historyRef.current = [];
        cropRef.current = null;
        setCrop(null);
        setUndoCount(0);
        setChanged(isChange);
        setStatus("ready");
      };
      image.onerror = () => setStatus("error");
      image.src = src;
    },
    [],
  );

  // เปิดใหม่ทุกครั้ง = เริ่มจากรูปปัจจุบันของโพย ด้วยเครื่องมือครอป
  React.useEffect(() => {
    if (!ticket) return;
    setTool("crop");
    load(ticketImageUrl(ticket.id, { editedAt: ticket.imageEditedAt }), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- โหลดใหม่เมื่อเปลี่ยนโพยเท่านั้น ไม่ใช่ทุกครั้งที่หน้า refresh
  }, [ticket?.id, load]);

  // canvas อยู่ใน Dialog — วาดหลังจากมันขึ้นจอแล้ว
  React.useEffect(() => {
    if (status === "ready") render();
  }, [status, render, crop]);

  function pushHistory() {
    const work = workRef.current;
    if (!work) return;
    const copy = cloneCanvas(work);
    copy.getContext("2d")!.drawImage(work, 0, 0);
    historyRef.current = [...historyRef.current, copy].slice(-HISTORY_MAX);
    setUndoCount(historyRef.current.length);
    setChanged(true);
  }

  function replaceWork(next: HTMLCanvasElement) {
    workRef.current = next;
    cropRef.current = null;
    setCrop(null);
    render();
  }

  /** ตำแหน่งบนจอ → พิกเซลของรูปจริง (canvas ถูกย่อด้วย CSS) */
  function toImage(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    return {
      point: {
        x: Math.min(Math.max((event.clientX - rect.left) * scale, 0), canvas.width),
        y: Math.min(Math.max((event.clientY - rect.top) * scale, 0), canvas.height),
      },
      scale,
    };
  }

  function erase(from: Point, to: Point, scale: number) {
    const ctx = workRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = ERASE_COLOR;
    ctx.lineWidth = brush * scale;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    render();
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (status !== "ready") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const { point, scale } = toImage(event);
    dragRef.current = { start: point, last: point };
    if (tool === "erase") {
      pushHistory();
      erase(point, point, scale);
    } else {
      cropRef.current = null;
      render();
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const { point, scale } = toImage(event);
    if (tool === "erase") {
      erase(drag.last, point, scale);
    } else {
      cropRef.current = {
        x: Math.min(drag.start.x, point.x),
        y: Math.min(drag.start.y, point.y),
        w: Math.abs(point.x - drag.start.x),
        h: Math.abs(point.y - drag.start.y),
      };
      render();
    }
    drag.last = point;
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (tool !== "crop") return;
    // แตะเฉย ๆ / ลากนิดเดียว = ยกเลิกกรอบ
    const { scale } = toImage(event);
    const rect = cropRef.current;
    if (rect && (rect.w < 12 * scale || rect.h < 12 * scale)) cropRef.current = null;
    setCrop(cropRef.current);
    render();
  }

  function applyCrop() {
    const work = workRef.current;
    const rect = cropRef.current;
    if (!work || !rect) return;
    pushHistory();
    const x = Math.round(rect.x);
    const y = Math.round(rect.y);
    const w = Math.max(1, Math.round(rect.w));
    const h = Math.max(1, Math.round(rect.h));
    const next = cloneCanvas(work, w, h);
    next.getContext("2d")!.drawImage(work, x, y, w, h, 0, 0, w, h);
    replaceWork(next);
  }

  function rotate() {
    const work = workRef.current;
    if (!work) return;
    pushHistory();
    const next = cloneCanvas(work, work.height, work.width);
    const ctx = next.getContext("2d")!;
    ctx.translate(next.width, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(work, 0, 0);
    replaceWork(next);
  }

  function undo() {
    const previous = historyRef.current.at(-1);
    if (!previous) return;
    historyRef.current = historyRef.current.slice(0, -1);
    setUndoCount(historyRef.current.length);
    replaceWork(previous);
  }

  function handleSave() {
    if (cropRef.current) applyCrop(); // กรอบที่ลากไว้แต่ยังไม่ได้กด "ใช้การครอป" = ตั้งใจครอป
    const work = workRef.current;
    if (!work) return;
    const ratio = Math.min(1, MAX_SIDE / Math.max(work.width, work.height));
    const output = cloneCanvas(work, Math.round(work.width * ratio), Math.round(work.height * ratio));
    const ctx = output.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(work, 0, 0, output.width, output.height);
    const data = output.toDataURL("image/jpeg", 0.9).replace(/^data:image\/jpeg;base64,/, "");
    onSubmit({ data, mimeType: "image/jpeg" });
  }

  const ready = status === "ready";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="scroll-area max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-baseline gap-x-2">
            {t("tickets.editImageTitle")}
            {ticket?.billNo != null ? (
              <span className="text-sm font-medium text-muted-foreground tabular-nums">
                {t("tickets.billNoOf", { no: ticket.billNo, draw: ticket.drawName })}
              </span>
            ) : null}
          </DialogTitle>
          <DialogDescription>{t("tickets.editImageDesc")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label={t("tickets.editImageTool")} className="flex gap-1 rounded-md border p-1">
            {(
              [
                { value: "crop", icon: Crop, label: "tickets.toolCrop" },
                { value: "erase", icon: Eraser, label: "tickets.toolErase" },
              ] as const
            ).map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                role="radio"
                aria-checked={tool === option.value}
                variant={tool === option.value ? "default" : "ghost"}
                onClick={() => setTool(option.value)}
              >
                <option.icon /> {t(option.label)}
              </Button>
            ))}
          </div>

          {tool === "erase" ? (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              {t("tickets.brushSize")}
              <input
                type="range"
                min={BRUSH_SIZES.min}
                max={BRUSH_SIZES.max}
                value={brush}
                onChange={(event) => setBrush(Number(event.target.value))}
                className="w-28 accent-primary"
              />
            </label>
          ) : crop ? (
            <Button type="button" size="sm" onClick={applyCrop}>
              <Crop /> {t("tickets.applyCrop")}
            </Button>
          ) : null}

          <div className="ml-auto flex flex-wrap gap-1">
            <Button type="button" size="sm" variant="outline" onClick={rotate} disabled={!ready}>
              <RotateCw /> {t("tickets.rotate")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={undo} disabled={!ready || undoCount === 0}>
              <Undo2 /> {t("tickets.undo")}
            </Button>
            {ticket?.imageEditedAt ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={status === "loading"}
                onClick={() => load(ticketImageUrl(ticket.id, { original: true }), true)}
              >
                <History /> {t("tickets.useOriginal")}
              </Button>
            ) : null}
          </div>
        </div>

        <p className="-mt-1 text-xs text-muted-foreground">
          {t(tool === "crop" ? "tickets.cropHint" : "tickets.eraseHint")}
        </p>

        <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-md border bg-muted p-2">
          {status === "error" ? (
            <p className="text-sm font-medium text-destructive">{t("tickets.imageLoadFailed")}</p>
          ) : status === "loading" ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : null}
          <canvas
            ref={canvasRef}
            aria-label={t("tickets.imageAlt")}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className={cn("h-auto max-h-[60dvh] w-auto max-w-full touch-none cursor-crosshair", !ready && "hidden")}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={handleSave} disabled={!ready || !(changed || crop)}>
            <ScanText /> {t("tickets.editImageSave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
