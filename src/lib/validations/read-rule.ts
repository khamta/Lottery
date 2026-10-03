import { z } from "zod";

import { READ_RULE_KINDS, findLines, isPattern, slotsIn, unknownSlots } from "@/lottery/read-rules";

export const readRuleKindEnum = z.enum(READ_RULE_KINDS);

/** หนึ่งบรรทัด — เงื่อนไขใช้กับทีละบรรทัด จึงห้ามขึ้นบรรทัดใหม่ */
const oneLine = (max: number) =>
  z
    .string()
    .max(max, "readRules.validation.tooLong")
    .refine((value) => !/[\r\n]/.test(value), "readRules.validation.oneLine");

/** ช่องค้นหาใส่ได้หลายบรรทัด (บรรทัดละแบบ ใช้ผลลัพธ์เดียวกัน) — จำกัดความยาวทีละบรรทัด */
export const READ_RULE_FIND_LINES = 20;

const readRuleFields = z.object({
  kind: readRuleKindEnum,
  find: z
    .string()
    .refine((value) => findLines(value).length > 0, "readRules.validation.findRequired")
    .refine((value) => findLines(value).every((line) => line.length <= 200), "readRules.validation.tooLong")
    .refine((value) => findLines(value).length <= READ_RULE_FIND_LINES, "readRules.validation.tooManyLines"),
  replace: oneLine(200).default(""),
  note: z.string().max(500, "validation.descriptionMax").optional().or(z.literal("")),
  isActive: z.boolean().default(true),
});

type ReadRuleFields = z.infer<typeof readRuleFields>;

function checkReadRule(value: ReadRuleFields, ctx: z.RefinementCtx) {
  const issue = (path: "find" | "replace", message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

  // ตรวจทีละบรรทัด — ทุกบรรทัดใช้ผลลัพธ์เดียวกัน ช่องในผลลัพธ์จึงต้องมีในทุกบรรทัด
  const lines = findLines(value.find);
  if (value.kind !== "REPLACE" && lines.some((line) => unknownSlots(line).length > 0)) {
    issue("find", "readRules.validation.unknownSlot");
  }
  if (value.kind === "PATTERN") {
    const slotsOf = lines.map(slotsIn);
    if (!lines.every(isPattern)) issue("find", "readRules.validation.patternNeedsSlot");
    else if (slotsOf.some((slots) => new Set(slots).size !== slots.length)) {
      issue("find", "readRules.validation.duplicateSlot");
    }
    if (!value.replace.trim()) issue("replace", "readRules.validation.replaceRequired");
    else if (unknownSlots(value.replace).length > 0) {
      issue("replace", "readRules.validation.unknownSlot");
    } else if (slotsIn(value.replace).some((slot) => slotsOf.some((slots) => !slots.includes(slot)))) {
      issue("replace", "readRules.validation.slotNotInFind");
    }
  }
}

/** ข้อความ error เป็นคีย์ i18n — กฎเฉพาะ module ใช้ readRules.validation.* (src/i18n/modules/read-rules.ts) กฎกลางใช้ validation.* */
export const readRuleSchema = readRuleFields.superRefine(checkReadRule);

export const createReadRuleSchema = readRuleSchema;
export const updateReadRuleSchema = readRuleFields
  .extend({ id: z.string().min(1, "validation.required") })
  .superRefine(checkReadRule);
export const deleteReadRuleSchema = z.object({ id: z.string().min(1, "validation.required") });
/** ลบหลายรายการพร้อมกัน — จำกัดไม่เกิน 100 id ต่อครั้ง (เท่ากับ pageSize สูงสุด) */
export const deleteReadRulesSchema = z.object({
  ids: z
    .array(z.string().min(1, "validation.required"))
    .min(1, "validation.required")
    .max(100, "validation.required"),
});

/** เพิ่มหลายเงื่อนไขในครั้งเดียว (หน้าต่างเพิ่มเงื่อนไขมีหลายแถว) */
export const READ_RULES_PER_SAVE = 20;
export const createReadRulesSchema = z.object({
  rules: z.array(readRuleSchema).min(1, "validation.required").max(READ_RULES_PER_SAVE, "readRules.validation.tooManyRows"),
});
/** เปิด/ปิดหลายรายการที่เลือกพร้อมกัน */
export const setReadRulesActiveSchema = deleteReadRulesSchema.extend({ isActive: z.boolean() });

export type ReadRuleInput = z.infer<typeof readRuleSchema>;
export type ReadRulesInput = z.infer<typeof createReadRulesSchema>;
export type ReadRuleKindValue = z.infer<typeof readRuleKindEnum>;
