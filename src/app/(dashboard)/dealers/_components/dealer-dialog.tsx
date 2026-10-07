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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { dealerSchema, type DealerInput } from "@/lib/validations/dealer";
import { useI18n } from "@/i18n/client";
import {
  AI_PROVIDER_LABELS,
  AI_PROVIDERS,
  OCR_MODEL_AUTO,
  OCR_MODELS,
  OCR_REREAD_NONE,
  ocrModelLabel,
  providerOf,
  type AiProvider,
  type OcrModels,
} from "@/lottery/ai-models";
import type { DealerRow } from "../types";

/** ฟอร์มล้วน ๆ — ไม่เรียก server action เอง ส่งค่ากลับให้ view ผ่าน onSubmit */
type DealerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealer: DealerRow | null;
  /** รุ่นที่โหมดอัตโนมัติใช้ — แสดงในตัวเลือก "อัตโนมัติ" */
  ocrDefaults: OcrModels;
  /** รุ่นของ Ollama Cloud ที่อ่านรูปได้ (ดึงสดที่ server · ดู listOllamaVisionModels) */
  ollamaModels: string[];
  onSubmit: (values: DealerInput) => void;
};

const emptyValues: DealerInput = { name: "", note: "", ocrModel: OCR_MODEL_AUTO, ocrStrongModel: OCR_REREAD_NONE };

const CLAUDE_MODELS = OCR_MODELS.filter((model) => model.provider === "claude").map((model) => model.id);

/** รุ่นที่ให้เลือก แยกกลุ่มตามผู้ให้บริการ (Claude / Ollama Cloud) — ใช้ทั้งรุ่นหลักและรุ่นอ่านซ้ำ */
function ModelGroups({ models }: { models: Record<AiProvider, string[]> }) {
  return AI_PROVIDERS.map((provider) => (
    <SelectGroup key={provider}>
      <SelectLabel>{AI_PROVIDER_LABELS[provider]}</SelectLabel>
      {models[provider].map((id) => (
        <SelectItem key={id} value={id}>
          {ocrModelLabel(id)}
        </SelectItem>
      ))}
    </SelectGroup>
  ));
}

export function DealerDialog({ open, onOpenChange, dealer, ocrDefaults, ollamaModels, onSubmit }: DealerDialogProps) {
  const { t } = useI18n();
  const isEdit = !!dealer;

  const form = useForm<DealerInput>({
    resolver: zodResolver(dealerSchema),
    defaultValues: emptyValues,
  });

  React.useEffect(() => {
    if (!open) return;
    form.reset(
      dealer
        ? { name: dealer.name, note: dealer.note ?? "", ocrModel: dealer.ocrModel, ocrStrongModel: dealer.ocrStrongModel }
        : emptyValues,
    );
  }, [open, dealer, form]);

  const ocrModel = form.watch("ocrModel");
  // รุ่นที่แม่หวยเลือกไว้แต่หายจากรายการของ Ollama (เลิกให้บริการ / ดึงรายการไม่ได้) — ยังแสดงให้เห็นว่าเลือกอะไรไว้
  const models = React.useMemo(() => {
    const saved = [dealer?.ocrModel, dealer?.ocrStrongModel].filter(
      (id): id is string => !!id && id !== OCR_MODEL_AUTO && id !== OCR_REREAD_NONE && providerOf(id) === "ollama",
    );
    return { claude: CLAUDE_MODELS, ollama: [...new Set([...ollamaModels, ...saved])] };
  }, [dealer, ollamaModels]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("dealers.editTitle") : t("dealers.addTitle")}</DialogTitle>
          <DialogDescription>{t("dealers.dialogDesc")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("dealers.name")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("dealers.namePlaceholder")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("dealers.note")}</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="ocrModel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("dealers.ocrModel")}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={OCR_MODEL_AUTO}>
                        {ocrDefaults.strongModel && ocrDefaults.strongModel !== ocrDefaults.model
                          ? t("dealers.ocrAuto", {
                              model: ocrModelLabel(ocrDefaults.model),
                              strong: ocrModelLabel(ocrDefaults.strongModel),
                            })
                          : t("dealers.ocrAutoSingle", { model: ocrModelLabel(ocrDefaults.model) })}
                      </SelectItem>
                      <ModelGroups models={models} />
                    </SelectContent>
                  </Select>
                  <FormDescription>{t("dealers.ocrModelHint")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {ocrModel !== OCR_MODEL_AUTO && (
              <FormField
                control={form.control}
                name="ocrStrongModel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("dealers.ocrStrongModel")}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={OCR_REREAD_NONE}>{t("dealers.ocrNoReread")}</SelectItem>
                        <ModelGroups models={models} />
                      </SelectContent>
                    </Select>
                    <FormDescription>{t("dealers.ocrStrongModelHint")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

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
