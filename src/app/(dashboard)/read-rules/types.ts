import type { ReadRuleKindValue } from "@/lib/validations/read-rule";

/** รูปแบบข้อมูลที่ส่งจาก server ไป client (Date -> string) */
export type ReadRuleRow = {
  id: string;
  kind: ReadRuleKindValue;
  find: string;
  replace: string;
  note: string | null;
  isActive: boolean;
  updatedAt: string;
};

/** คอลัมน์ที่ยอมให้เรียงได้ — ชื่อต้องตรงกับ field ใน Prisma */
export const READ_RULE_SORTABLE = ["kind", "find", "isActive", "updatedAt", "createdAt"] as const;

/** ชนิดเงื่อนไข -> คีย์ i18n (ห้ามเก็บข้อความตรง ๆ เพราะระบบรองรับ 4 ภาษา) */
export const kindKey: Record<ReadRuleKindValue, string> = {
  SKIP: "readRules.kindSKIP",
  REPLACE: "readRules.kindREPLACE",
  PATTERN: "readRules.kindPATTERN",
};

export const kindHintKey: Record<ReadRuleKindValue, string> = {
  SKIP: "readRules.kindHintSKIP",
  REPLACE: "readRules.kindHintREPLACE",
  PATTERN: "readRules.kindHintPATTERN",
};
