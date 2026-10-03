"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm, type Control } from "react-hook-form";
import { ArrowRight, Plus, Save, X } from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createReadRulesSchema,
  readRuleSchema,
  READ_RULES_PER_SAVE,
  type ReadRuleInput,
  type ReadRulesInput,
} from "@/lib/validations/read-rule";
import { useI18n } from "@/i18n/client";
import { parseTicket } from "@/lottery/parser";
import { applyReadRules, prepareReadRules, READ_RULE_KINDS, type ReadRuleSpec } from "@/lottery/read-rules";
import { TicketPreview } from "../../tickets/_components/ticket-preview";
import { kindHintKey, kindKey, type ReadRuleRow } from "../types";

/**
 * ฟอร์มล้วน ๆ — ไม่เรียก server action เอง
 * ส่งค่ากลับให้ view ผ่าน onSubmit เพื่อให้ view เป็นคนทำ optimistic update
 *
 * เพิ่มใหม่ได้หลายเงื่อนไขในครั้งเดียว (ปุ่ม "เพิ่มอีกข้อ") — แก้ไขได้ทีละข้อ
 * ช่อง "ลองกับข้อความ": วางข้อความจากแชตแล้วเห็นทันทีว่าแต่ละบรรทัดถูกแปลงเป็นอะไร
 * และระบบอ่านได้กี่รายการ — อ่านด้วยเงื่อนไขที่เปิดใช้ทั้งหมด + ทุกข้อที่กำลังกรอก เหมือนที่ระบบอ่านจริง
 */
type ReadRuleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: ReadRuleRow | null;
  activeRules: ReadRuleSpec[];
  /** ข้อที่กรอกตามลำดับแถว — ตอนแก้ไขมีข้อเดียวเสมอ */
  onSubmit: (values: ReadRuleInput[]) => void;
};

const emptyRule: ReadRuleInput = { kind: "PATTERN", find: "", replace: "", note: "", isActive: true };

/** ช่องที่กดใส่ในรูปแบบได้ */
const SLOT_BUTTONS = ["{N}", "{A}", "{B}", "*"] as const;

const sameRule = (a: ReadRuleSpec, b: ReadRuleSpec) => a.kind === b.kind && a.find === b.find && a.replace === b.replace;

export function ReadRuleDialog({ open, onOpenChange, rule, activeRules, onSubmit }: ReadRuleDialogProps) {
  const { t } = useI18n();
  const isEdit = !!rule;
  const [sample, setSample] = React.useState("");

  const form = useForm<ReadRulesInput>({
    resolver: zodResolver(createReadRulesSchema),
    defaultValues: { rules: [emptyRule] },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "rules" });

  // sync ค่าเมื่อเปิด dialog (เพิ่มใหม่ = ล้างฟอร์ม, แก้ไข = เติมค่าเดิม)
  React.useEffect(() => {
    if (!open) return;
    form.reset({
      rules: [
        rule
          ? { kind: rule.kind, find: rule.find, replace: rule.replace, note: rule.note ?? "", isActive: rule.isActive }
          : emptyRule,
      ],
    });
    setSample("");
  }, [open, rule, form]);

  const drafts = form.watch("rules");
  // watch คืน array ใหม่ทุก render — ใช้ข้อความเป็น key ของ useMemo ไม่ให้คำนวณซ้ำทุกครั้ง
  const draftsKey = JSON.stringify(drafts.map(({ kind, find, replace, isActive }) => ({ kind, find, replace, isActive })));

  // เงื่อนไขทั้งชุดที่จะใช้ถ้าบันทึก: เงื่อนไขเดิม (ตัดตัวที่กำลังแก้ออก) + ทุกข้อที่กรอก (ถ้าใช้ได้และเปิดใช้)
  const { withDraft, withoutDraft } = React.useMemo(() => {
    const original = rule ? { kind: rule.kind, find: rule.find, replace: rule.replace } : null;
    const at = original ? activeRules.findIndex((other) => sameRule(other, original)) : -1;
    const others = at >= 0 ? activeRules.filter((_, i) => i !== at) : activeRules;
    const valid = (JSON.parse(draftsKey) as Omit<ReadRuleInput, "note">[])
      .map((draft) => ({ ...draft, replace: draft.kind === "SKIP" ? "" : draft.replace }))
      .filter((draft) => draft.isActive && readRuleSchema.safeParse({ ...draft, note: "" }).success)
      .map(({ kind, find, replace }) => ({ kind, find, replace }));
    const list = [...others];
    list.splice(at >= 0 ? at : list.length, 0, ...valid);
    return { withDraft: list, withoutDraft: others };
  }, [activeRules, rule, draftsKey]);

  const lines = React.useMemo(() => {
    const prepared = prepareReadRules(withDraft);
    const before = prepareReadRules(withoutDraft);
    return sample
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => {
        const result = applyReadRules(line.trim(), prepared);
        return { line: line.trim(), result, changed: result !== applyReadRules(line.trim(), before) };
      });
  }, [sample, withDraft, withoutDraft]);

  const parsed = React.useMemo(() => parseTicket(sample, { rules: withDraft }), [sample, withDraft]);

  // zod ตรวจฝั่ง client แล้วค่อยส่งต่อ — server ตรวจซ้ำอีกชั้นเสมอ
  function handleValid(values: ReadRulesInput) {
    onSubmit(values.rules);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="scroll-area max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("readRules.editTitle") : t("readRules.addTitle")}</DialogTitle>
          <DialogDescription>{t("readRules.dialogDesc")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleValid)} className="grid gap-4">
            {fields.map((field, index) => (
              <RuleFields
                key={field.id}
                index={index}
                control={form.control}
                kind={drafts[index]?.kind ?? "PATTERN"}
                numbered={fields.length > 1}
                onRemove={() => remove(index)}
                onInsert={(name, token) => {
                  const path = `rules.${index}.${name}` as const;
                  form.setValue(path, `${form.getValues(path)}${token}`, {
                    shouldValidate: form.formState.isSubmitted,
                  });
                }}
              />
            ))}

            {!isEdit && fields.length < READ_RULES_PER_SAVE ? (
              <Button type="button" variant="outline" className="justify-self-start" onClick={() => append(emptyRule)}>
                <Plus /> {t("readRules.addRow")}
              </Button>
            ) : null}

            <div className="grid gap-2 rounded-lg border p-3">
              <p className="text-sm font-medium">{t("readRules.tryTitle")}</p>
              <Textarea
                rows={5}
                value={sample}
                onChange={(event) => setSample(event.target.value)}
                placeholder={t("readRules.tryPlaceholder")}
                className="font-mono tabular-nums"
              />
              {lines.length > 0 ? (
                <ul className="grid gap-1 text-sm">
                  {lines.map(({ line, result, changed }, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2 font-mono">
                      <span className="break-all">{line}</span>
                      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                      {result === null ? (
                        <Badge variant="outline">{t("readRules.skipped")}</Badge>
                      ) : (
                        <span className="break-all">{result}</span>
                      )}
                      {changed ? <Badge variant="default">{t("readRules.byThisRule")}</Badge> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {sample.trim() ? <TicketPreview parsed={parsed} /> : null}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit">
                <Save />{" "}
                {isEdit
                  ? t("common.saveEdit")
                  : fields.length > 1
                    ? t("readRules.saveMany", { count: fields.length })
                    : t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

type RuleFieldsProps = {
  index: number;
  control: Control<ReadRulesInput>;
  kind: ReadRuleInput["kind"];
  /** มีหลายข้อ → มีกรอบ เลขข้อ และปุ่มลบแถว */
  numbered: boolean;
  onRemove: () => void;
  onInsert: (name: "find" | "replace", token: string) => void;
};

/** ช่องกรอกของเงื่อนไขหนึ่งข้อ */
function RuleFields({ index, control, kind, numbered, onRemove, onInsert }: RuleFieldsProps) {
  const { t } = useI18n();

  return (
    <div className={numbered ? "grid gap-4 rounded-lg border p-3" : "grid gap-4"}>
      {numbered ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{t("readRules.rowTitle", { index: index + 1 })}</p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={t("readRules.removeRow")}
            onClick={onRemove}
          >
            <X />
          </Button>
        </div>
      ) : null}

      <FormField
        control={control}
        name={`rules.${index}.kind`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("readRules.kind")}</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {READ_RULE_KINDS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(kindKey[value])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormDescription>{t(kindHintKey[kind])}</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className={kind === "SKIP" ? "grid gap-4" : "grid gap-4 sm:grid-cols-2"}>
        <FormField
          control={control}
          name={`rules.${index}.find`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t(kind === "REPLACE" ? "readRules.findText" : "readRules.findPattern")}</FormLabel>
              <FormControl>
                <Textarea
                  rows={3}
                  placeholder={t(`readRules.findPlaceholder${kind}`)}
                  className="font-mono"
                  autoComplete="off"
                  {...field}
                />
              </FormControl>
              <FormDescription>{t("readRules.findLinesHint")}</FormDescription>
              {kind !== "REPLACE" ? <SlotButtons onInsert={(token) => onInsert("find", token)} /> : null}
              <FormMessage />
            </FormItem>
          )}
        />
        {kind !== "SKIP" ? (
          <FormField
            control={control}
            name={`rules.${index}.replace`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("readRules.replace")}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t(`readRules.replacePlaceholder${kind}`)}
                    className="font-mono"
                    autoComplete="off"
                    {...field}
                  />
                </FormControl>
                {kind === "PATTERN" ? (
                  <SlotButtons onInsert={(token) => onInsert("replace", token)} withAny={false} />
                ) : null}
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}
      </div>
      {kind !== "REPLACE" ? <p className="-mt-2 text-xs text-muted-foreground">{t("readRules.slotsHint")}</p> : null}

      <FormField
        control={control}
        name={`rules.${index}.note`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("readRules.note")}</FormLabel>
            <FormControl>
              <Input placeholder={t("readRules.notePlaceholder")} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name={`rules.${index}.isActive`}
        render={({ field }) => (
          <FormItem>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
              <span>{t("readRules.isActive")}</span>
            </label>
          </FormItem>
        )}
      />
    </div>
  );
}

/** ปุ่มใส่ช่อง {N} {A} {B} * — พิมพ์ปีกกาบนมือถือยาก */
function SlotButtons({ onInsert, withAny = true }: { onInsert: (token: string) => void; withAny?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1">
      {SLOT_BUTTONS.filter((token) => withAny || token !== "*").map((token) => (
        <Button
          key={token}
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 font-mono"
          onClick={() => onInsert(token)}
        >
          {token}
        </Button>
      ))}
    </div>
  );
}
