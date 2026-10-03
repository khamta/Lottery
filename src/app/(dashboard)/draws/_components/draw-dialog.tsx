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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { siteConfig } from "@/config/site";
import { drawSchema, type DrawInput } from "@/lib/validations/draw";
import { useI18n } from "@/i18n/client";
import { isoToDisplay, todayIso } from "@/lottery/date";
import { LOTTERY_TYPES, lotteryLabel, type LotteryTypeValue } from "@/lottery/labels";
import type { DrawRow } from "../types";

/**
 * ฟอร์มล้วน ๆ — ไม่เรียก server action เอง
 * ส่งค่ากลับให้ view ผ่าน onSubmit เพื่อให้ view เป็นคนทำ optimistic update
 * สถานะคิดจากเลขที่ออก (src/lottery/draw-status.ts)
 */
type DrawDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draw: DrawRow | null;
  onSubmit: (values: DrawInput) => void;
};

export function DrawDialog({ open, onOpenChange, draw, onSubmit }: DrawDialogProps) {
  const { t } = useI18n();
  const isEdit = !!draw;

  const form = useForm<DrawInput>({
    resolver: zodResolver(drawSchema),
    defaultValues: { name: "", lottery: "LAO", drawDate: "", topResult: "", bottomResult: "" },
  });

  /** ชื่อตั้งต้นของงวด — หวยเวียดนามวันเดียวมีหลายงวด จึงมีรหัสรอบนำหน้า (ชื่องวดห้ามซ้ำในแม่หวยเดียวกัน) */
  const autoName = React.useCallback(
    (lottery: LotteryTypeValue, iso: string) => {
      const name = t("draws.defaultName", { date: isoToDisplay(iso) });
      return lottery === "LAO" ? name : `${lottery} ${name}`;
    },
    [t],
  );

  /** เปลี่ยนประเภทหวย/วันที่ของงวดใหม่ → ชื่อตั้งต้นตามไปด้วย (ถ้าผู้ใช้ยังไม่ได้แก้ชื่อเอง) */
  function followAutoName(next: { lottery?: LotteryTypeValue; drawDate?: string }) {
    if (isEdit) return;
    const { lottery, drawDate, name } = form.getValues();
    if (name !== autoName(lottery, drawDate)) return;
    form.setValue("name", autoName(next.lottery ?? lottery, next.drawDate ?? drawDate));
  }

  // sync ค่าเมื่อเปิด dialog (เพิ่มใหม่ = งวดของวันนี้, แก้ไข = เติมค่าเดิม)
  React.useEffect(() => {
    if (!open) return;
    const today = todayIso(siteConfig.timeZone);
    form.reset(
      draw
        ? {
            name: draw.name,
            lottery: draw.lottery,
            drawDate: draw.drawDate,
            topResult: draw.topResult ?? "",
            bottomResult: draw.bottomResult ?? "",
          }
        : {
            name: autoName("LAO", today),
            lottery: "LAO",
            drawDate: today,
            topResult: "",
            bottomResult: "",
          },
    );
  }, [open, draw, form, autoName]);

  // zod ตรวจฝั่ง client แล้วค่อยส่งต่อ — server ตรวจซ้ำอีกชั้นเสมอ
  function handleValid(values: DrawInput) {
    onSubmit(values);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("draws.editTitle") : t("draws.addTitle")}</DialogTitle>
          <DialogDescription>{t("draws.dialogDesc")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleValid)} className="grid gap-4">
            <FormField
              control={form.control}
              name="lottery"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("lottery.lotteryType")}</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      followAutoName({ lottery: value as LotteryTypeValue });
                      field.onChange(value);
                    }}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {LOTTERY_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {lotteryLabel(type, t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>{t("draws.lotteryHint")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("draws.name")}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="drawDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("draws.drawDate")}</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        onChange={(event) => {
                          followAutoName({ drawDate: event.target.value });
                          field.onChange(event);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="topResult"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("draws.topResult")}</FormLabel>
                    <FormControl>
                      <Input inputMode="numeric" maxLength={3} placeholder="000" className="tabular-nums" {...field} />
                    </FormControl>
                    <FormDescription>{t("draws.resultHint")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bottomResult"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("draws.bottomResult")}</FormLabel>
                    <FormControl>
                      <Input inputMode="numeric" maxLength={2} placeholder="00" className="tabular-nums" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit">
                <Save /> {isEdit ? t("common.saveEdit") : t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
