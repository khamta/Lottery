"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Save } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ticketSchema, type TicketInput } from "@/lib/validations/ticket";
import { useI18n } from "@/i18n/client";
import { DEFAULT_LAK_MULTIPLIER, parseTicket } from "@/lottery/parser";
import type { ReadRuleSpec } from "@/lottery/read-rules";
import { isTicketMessage } from "@/lottery/ticket";
import { ticketImageUrl, type CustomerOption, type DrawOption, type TicketRow } from "../types";
import { countFilledLines, NumberedTextarea } from "./numbered-textarea";
import { TicketPreview } from "./ticket-preview";

/**
 * ฟอร์มล้วน ๆ — ไม่เรียก server action เอง
 * ส่งค่ากลับให้ view ผ่าน onSubmit เพื่อให้ view เป็นคนทำ optimistic update
 *
 * วางข้อความจากแชตลงช่องเดียว ระบบแยกเลข/ยอดให้ดูสด ๆ ด้วยตัวแยกชุดเดียวกับ server
 * โพยจากรูป: แสดงรูปคู่กับข้อความที่ OCR แปลงได้ ให้คนเทียบแล้วแก้ก่อนบันทึก
 */
type TicketDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: TicketRow | null;
  draws: DrawOption[];
  customers: CustomerOption[];
  /** เงื่อนไขอ่านโพยของแม่หวย — ตัวอย่างสดอ่านเหมือนที่ server บันทึก */
  rules: ReadRuleSpec[];
  /** งวดที่กำลังกรองอยู่ในตาราง — ใช้เป็นค่าตั้งต้นของโพยใหม่ */
  defaultDrawId: string | null;
  onSubmit: (values: TicketInput) => void;
};

/** Radix Select ไม่รับค่าว่าง จึงใช้ค่านี้แทน "ไม่ระบุลูกค้า" */
const NONE = "none";

const sameValues = (a: TicketInput, b: TicketInput) =>
  a.drawId === b.drawId &&
  a.customerId === b.customerId &&
  a.text === b.text &&
  a.note === b.note &&
  a.force === b.force;

export function TicketDialog({
  open,
  onOpenChange,
  ticket,
  draws,
  customers,
  rules,
  defaultDrawId,
  onSubmit,
}: TicketDialogProps) {
  const { t } = useI18n();
  const isEdit = !!ticket;
  const hasImage = !!ticket?.ocrStatus;

  // โพยลงได้เฉพาะงวดที่เปิดรับ — ตอนแก้ไขต้องเห็นงวดเดิมของโพยด้วยแม้จะปิดไปแล้ว
  const drawOptions = React.useMemo(
    () => draws.filter((draw) => draw.status === "OPEN" || draw.id === ticket?.drawId),
    [draws, ticket],
  );

  const form = useForm<TicketInput>({
    resolver: zodResolver(ticketSchema),
    defaultValues: { drawId: "", customerId: "", text: "", note: "", force: false },
  });

  // ค่าที่ฟอร์มถูกเติมครั้งล่าสุด — ใช้ดูว่าคนพิมพ์/แก้อะไรไปแล้วหรือยัง
  const filled = React.useRef<{ key: string; values: TicketInput } | null>(null);

  // sync ค่าเมื่อเปิด dialog (เพิ่มใหม่ = ล้างฟอร์ม, แก้ไข = เติมค่าเดิม)
  // หน้าโพย refresh เองระหว่างรออ่านรูป — โพยเดิมได้ข้อมูลใหม่ (รูปอ่านเสร็จ) ก็เติมใหม่ เว้นแต่คนแก้ฟอร์มไปแล้ว
  React.useEffect(() => {
    if (!open) {
      filled.current = null;
      return;
    }
    const key = ticket?.id ?? "";
    if (filled.current?.key === key && !sameValues(form.getValues(), filled.current.values)) return;

    const openDraws = draws.filter((draw) => draw.status === "OPEN");
    const values: TicketInput = ticket
      ? {
          drawId: ticket.drawId,
          customerId: ticket.customerId ?? "",
          text: ticket.rawText,
          note: ticket.note ?? "",
          force: false,
        }
      : {
          drawId: (openDraws.find((draw) => draw.id === defaultDrawId) ?? openDraws[0])?.id ?? "",
          customerId: "",
          text: "",
          note: "",
          force: false,
        };
    form.reset(values);
    filled.current = { key, values };
  }, [open, ticket, draws, defaultDrawId, form]);

  const [text, customerId, drawId, force] = form.watch(["text", "customerId", "drawId", "force"]);
  const lakMultiplier =
    customers.find((customer) => customer.id === customerId)?.lakMultiplier ?? DEFAULT_LAK_MULTIPLIER;
  const parsed = React.useMemo(() => parseTicket(text, { lakMultiplier, rules }), [text, lakMultiplier, rules]);

  const drawOpen = draws.find((draw) => draw.id === drawId)?.status === "OPEN";
  const hasIssues = parsed.issues.length > 0;
  const canForce = hasIssues && parsed.bets.length > 0;
  const canSave = drawOpen && isTicketMessage(parsed);

  // zod ตรวจฝั่ง client แล้วค่อยส่งต่อ — server ตรวจซ้ำอีกชั้นเสมอ
  function handleValid(values: TicketInput) {
    onSubmit({ ...values, force: values.force && canForce });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`scroll-area max-h-[calc(100dvh-2rem)] overflow-y-auto ${hasImage ? "sm:max-w-5xl" : "sm:max-w-2xl"}`}
      >
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-baseline gap-x-2">
            {isEdit ? t("tickets.editTitle") : t("tickets.addTitle")}
            {ticket?.billNo != null ? (
              <span className="text-sm font-medium text-muted-foreground tabular-nums">
                {t("tickets.billNoOf", { no: ticket.billNo, draw: ticket.drawName })}
              </span>
            ) : null}
          </DialogTitle>
          <DialogDescription>{t("tickets.dialogDesc")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleValid)} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="drawId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("tickets.draw")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("tickets.drawPlaceholder")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {drawOptions.map((draw) => (
                          <SelectItem key={draw.id} value={draw.id}>
                            {draw.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage>
                      {drawOptions.length === 0
                        ? t("tickets.noOpenDraw")
                        : drawId && !drawOpen
                          ? t("tickets.drawNotOpen")
                          : null}
                    </FormMessage>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("tickets.customer")}</FormLabel>
                    <Select
                      value={field.value || NONE}
                      onValueChange={(value) => field.onChange(value === NONE ? "" : value)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>{t("tickets.noCustomer")}</SelectItem>
                        {customers.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>
                            {customer.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className={hasImage ? "grid gap-4 lg:grid-cols-2 lg:items-start" : "contents"}>
              {ticket?.ocrStatus ? (
                <TicketImage ticketId={ticket.id} status={ticket.ocrStatus} transcript={ticket.ocrTranscript} />
              ) : null}
              <div className="grid gap-4">
                <FormField
                  control={form.control}
                  name="text"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-baseline justify-between gap-2">
                        <FormLabel>{t("tickets.text")}</FormLabel>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {t("tickets.lineCount", { count: countFilledLines(text) })}
                        </span>
                      </div>
                      <FormControl>
                        <NumberedTextarea
                          rows={hasImage ? 14 : 7}
                          placeholder={t(
                            ticket?.ocrStatus === "PENDING" ? "tickets.textPlaceholderOcr" : "tickets.textPlaceholder",
                          )}
                          className="tabular-nums"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {text.trim() ? (
                  isTicketMessage(parsed) ? (
                    <TicketPreview parsed={parsed} />
                  ) : (
                    <p className="text-sm font-medium text-destructive">{t("tickets.noBets")}</p>
                  )
                ) : null}
              </div>
            </div>

            {canForce ? (
              <FormField
                control={form.control}
                name="force"
                render={({ field }) => (
                  <FormItem>
                    <label className="flex items-start gap-2 text-sm">
                      <Checkbox
                        className="mt-0.5"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                      <span>{t("tickets.force")}</span>
                    </label>
                  </FormItem>
                )}
              />
            ) : null}
            {hasIssues && !(force && canForce) ? (
              <p className="-mt-2 text-xs text-muted-foreground">{t("tickets.willReview")}</p>
            ) : null}

            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("tickets.note")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("tickets.notePlaceholder")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={!canSave}>
                <Save /> {isEdit ? t("common.saveEdit") : t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * รูปโพยที่ลูกค้าส่งมา — กดเปิดขนาดเต็มในแท็บใหม่
 * ใต้รูปแสดงทุกอย่างที่ OCR อ่านได้ (ก่อนกรอง) ให้เทียบว่าอะไรถูกกรองทิ้งไป
 */
function TicketImage({
  ticketId,
  status,
  transcript,
}: {
  ticketId: string;
  status: NonNullable<TicketRow["ocrStatus"]>;
  transcript: string | null;
}) {
  const { t } = useI18n();
  const src = ticketImageUrl(ticketId);

  return (
    <div className="grid gap-2">
      <a href={src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element -- route ภายในที่ตรวจสิทธิ์เอง ไม่ต้องผ่าน next/image */}
        <img src={src} alt={t("tickets.imageAlt")} className="max-h-[60dvh] w-full object-contain" />
      </a>
      <p className={`text-xs ${status === "FAILED" ? "font-medium text-destructive" : "text-muted-foreground"}`}>
        {t(`tickets.imageHint${status}`)}
      </p>
      {transcript ? (
        <div className="grid gap-1">
          <p className="text-sm font-medium">{t("tickets.transcript")}</p>
          <pre className="whitespace-pre-wrap break-words rounded-md border bg-muted p-3 font-sans text-sm tabular-nums">
            {transcript}
          </pre>
          <p className="text-xs text-muted-foreground">{t("tickets.transcriptHint")}</p>
        </div>
      ) : null}
    </div>
  );
}
