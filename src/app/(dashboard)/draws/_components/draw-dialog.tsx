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
import { siteConfig } from "@/config/site";
import { drawSchema, type DrawInput } from "@/lib/validations/draw";
import { useI18n } from "@/i18n/client";
import { isoToDisplay, todayIso } from "@/lottery/date";
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
    defaultValues: { name: "", drawDate: "", topResult: "", bottomResult: "" },
  });

  // sync ค่าเมื่อเปิด dialog (เพิ่มใหม่ = งวดของวันนี้, แก้ไข = เติมค่าเดิม)
  React.useEffect(() => {
    if (!open) return;
    const today = todayIso(siteConfig.timeZone);
    form.reset(
      draw
        ? {
            name: draw.name,
            drawDate: draw.drawDate,
            topResult: draw.topResult ?? "",
            bottomResult: draw.bottomResult ?? "",
          }
        : {
            name: t("draws.defaultName", { date: isoToDisplay(today) }),
            drawDate: today,
            topResult: "",
            bottomResult: "",
          },
    );
  }, [open, draw, form, t]);

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
                      <Input type="date" {...field} />
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
