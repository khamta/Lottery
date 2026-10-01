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
import { AmountInput } from "@/components/shared/amount-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { limitSchema, type LimitInput } from "@/lib/validations/limit";
import { useI18n } from "@/i18n/client";
import { currencyKey, digitsKey, positionKey, type LimitRow } from "../types";

/**
 * ฟอร์มล้วน ๆ — ไม่เรียก server action เอง
 * ส่งค่ากลับให้ view ผ่าน onSubmit เพื่อให้ view เป็นคนทำ optimistic update
 */
type LimitDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  limit: LimitRow | null;
  onSubmit: (values: LimitInput) => void;
};

const emptyValues: LimitInput = {
  digits: 2,
  number: "",
  position: "TOP",
  currency: "LAK",
  maxAmount: 0,
};

export function LimitDialog({ open, onOpenChange, limit, onSubmit }: LimitDialogProps) {
  const { t } = useI18n();
  const isEdit = !!limit;

  const form = useForm<LimitInput>({
    resolver: zodResolver(limitSchema),
    defaultValues: emptyValues,
  });
  const digits = Number(form.watch("digits"));

  // sync ค่าเมื่อเปิด dialog (เพิ่มใหม่ = ล้างฟอร์ม, แก้ไข = เติมค่าเดิม)
  React.useEffect(() => {
    if (!open) return;
    form.reset(
      limit
        ? {
            digits: limit.digits,
            number: limit.number,
            position: limit.position,
            currency: limit.currency,
            maxAmount: limit.maxAmount,
          }
        : emptyValues,
    );
  }, [open, limit, form]);

  // zod ตรวจฝั่ง client แล้วค่อยส่งต่อ — server ตรวจซ้ำอีกชั้นเสมอ
  function handleValid(values: LimitInput) {
    onSubmit(values);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("limits.editTitle") : t("limits.addTitle")}</DialogTitle>
          <DialogDescription>{t("limits.dialogDesc")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleValid)} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="digits"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("limits.digits")}</FormLabel>
                    <Select
                      value={String(field.value)}
                      onValueChange={(value) => {
                        field.onChange(Number(value));
                        // เลข 3 ตัวลงได้เฉพาะบน
                        if (value === "3") form.setValue("position", "TOP");
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(digitsKey).map(([value, key]) => (
                          <SelectItem key={value} value={value}>
                            {t(key)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("limits.number")}</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="numeric"
                        maxLength={digits}
                        placeholder={t("limits.allNumbers")}
                        className="tabular-nums"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>{t("limits.numberHint")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="position"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("limits.position")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={digits === 3}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(positionKey).map(([value, key]) => (
                          <SelectItem key={value} value={value}>
                            {t(key)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("limits.currency")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(currencyKey).map(([value, key]) => (
                          <SelectItem key={value} value={value}>
                            {t(key)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="maxAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("limits.maxAmount")}</FormLabel>
                    <FormControl>
                      <AmountInput placeholder="0" decimals={0} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">{t("limits.maxAmountHint")}</p>

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
