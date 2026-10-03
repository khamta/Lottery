import { describe, expect, test } from "bun:test";

import { parseTicket } from "@/lottery/parser";
import { applyReadRules, compilePattern, prepareReadRules, type ReadRuleSpec } from "@/lottery/read-rules";
import { readRuleSchema } from "@/lib/validations/read-rule";

/** เทสต์เงื่อนไขอ่านโพยที่ผู้ใช้กำหนดเอง — ตัวแปลงล้วน และการใช้ร่วมกับตัวแยกข้อความ */
const run = (line: string, ...rules: ReadRuleSpec[]) => applyReadRules(line, prepareReadRules(rules));
const skip = (find: string): ReadRuleSpec => ({ kind: "SKIP", find, replace: "" });
const replace = (find: string, to: string): ReadRuleSpec => ({ kind: "REPLACE", find, replace: to });
const pattern = (find: string, to: string): ReadRuleSpec => ({ kind: "PATTERN", find, replace: to });

const brief = (text: string, rules: ReadRuleSpec[]) =>
  parseTicket(text, { rules, lakMultiplier: 1 }).bets.map((b) => `${b.number} ${b.position} ${b.currency} ${b.amount}`);

describe("PATTERN — รูปแบบบรรทัด", () => {
  test("ช่อง {N} {A} → รูปแบบมาตรฐาน · ช่องว่างในรูปแบบมีหรือไม่มีก็ได้", () => {
    const rule = pattern("ລ {N} x{A}", "{N}={A}ລ່າງ");

    expect(run("ລ 30 70 x100", rule)).toBe("30 70=100ລ່າງ");
    expect(run("ລ30.70x100", rule)).toBe("30.70=100ລ່າງ");
    expect(run("ລ 30 70 X 100", rule)).toBe("30 70=100ລ່າງ");
  });

  test("ไม่ตรงทั้งบรรทัด → ไม่แปลง (ส่งต่อตามเดิม)", () => {
    expect(run("ລ 30 70 x100 ok", pattern("ລ {N} x{A}", "{N}={A}ລ່າງ"))).toBe("ລ 30 70 x100 ok");
  });

  test("{N} กับ {A} คั่นด้วยช่องว่างอย่างเดียว — ตัวท้ายเป็นยอด", () => {
    expect(run("30 70 100", pattern("{N} {A}", "{N}={A}"))).toBe("30 70=100");
  });

  test("{B} = ยอดตัวที่สอง · * = อะไรก็ได้", () => {
    expect(run("บน 32 ล่าง 50/50", pattern("บน {N} ล่าง {A}/{B}", "{N}={A}*{B}"))).toBe("32=50*50");
    expect(run("Noy: 32-50", pattern("*: {N}-{A}", "{N}={A}"))).toBe("32=50");
  });

  test("ชื่อช่องภาษาไทย/ลาวใช้ได้เหมือน {N} {A}", () => {
    expect(run("32 ยอด 50", pattern("{เลข} ยอด {ยอด}", "{N}={A}"))).toBe("32=50");
    expect(run("32 ຍອດ 50", pattern("{ເລກ} ຍອດ {ຍອດ}", "{ເລກ}={ຍອດ}"))).toBe("32=50");
  });

  test("ใช้เงื่อนไขแรกที่ตรง", () => {
    expect(run("32 50", pattern("{N} {A}", "{N}={A}"), pattern("{N} {A}", "{N}={A}ລ່າງ"))).toBe("32=50");
  });

  test("รูปแบบที่ใช้ไม่ได้ถูกข้าม ไม่ทำให้อ่านพัง", () => {
    expect(compilePattern("{X} {A}")).toBeNull();
    expect(compilePattern("{N} {N}")).toBeNull();
    expect(run("32 50", pattern("{X} {A}", "{A}"))).toBe("32 50");
  });
});

describe("REPLACE / SKIP", () => {
  test("แทนคำทุกที่ในบรรทัด ไม่สนตัวพิมพ์เล็ก/ใหญ่ · ผลลัพธ์ว่าง = ลบ · $ เป็นตัวอักษรธรรมดา", () => {
    expect(run("32/50 72/50", replace("/", "="))).toBe("32=50 72=50");
    expect(run("32=50 BAHT", replace("baht", "฿"))).toBe("32=50 ฿");
    expect(run("32=50 ok", replace("ok", ""))).toBe("32=50");
    expect(run("32=50", replace("=", "$&"))).toBe("32$&50");
  });

  test("ข้ามบรรทัดที่มีคำนี้ · รูปแบบต้องตรงทั้งบรรทัด", () => {
    expect(run("ໂອນແລ້ວ 500", skip("ໂອນແລ້ວ"))).toBeNull();
    expect(run("30.9.26", skip("{N}.{A}.{B}"))).toBeNull();
    expect(run("30.9.26 x", skip("{N}.{A}.{B}"))).toBe("30.9.26 x");
  });

  test("ลำดับ: ข้าม → แทนคำ → รูปแบบ ไม่ว่าจะสร้างก่อนหลัง", () => {
    const rules = [pattern("{N}={A} ລ", "{N}={A}ລ່າງ"), replace("/", "="), skip("ໂອນ")];

    expect(run("32/50 ລ", ...rules)).toBe("32=50ລ່າງ");
    expect(run("ໂອນ 32/50", ...rules)).toBeNull();
  });
});

describe("ใช้ร่วมกับตัวแยกข้อความ (parseTicket)", () => {
  test("บรรทัดที่อ่านไม่ออก → อ่านได้เมื่อมีเงื่อนไข", () => {
    const text = "ລ 30 70 x100\n243=150";

    expect(parseTicket(text).issues).toHaveLength(1);
    expect(brief(text, [pattern("ລ {N} x{A}", "{N}={A}ລ່າງ")])).toEqual([
      "30 BOTTOM LAK 100",
      "70 BOTTOM LAK 100",
      "243 TOP LAK 150",
    ]);
  });

  test("บรรทัดที่ข้าม = บันทึกช่วยจำ ไม่ใช่ issue · issue ยังแสดงบรรทัดตามที่ลูกค้าพิมพ์", () => {
    const parsed = parseTicket("ໂອນແລ້ວ 500\n32/50\n99 ??", { rules: [skip("ໂອນແລ້ວ"), replace("/", "=")] });

    expect(parsed.notes).toEqual(["ໂອນແລ້ວ 500"]);
    expect(parsed.bets).toHaveLength(1);
    expect(parsed.issues).toEqual([{ code: "UNREADABLE", line: 3, text: "99 ??" }]);
  });

  test("เลขลาว/ไทยแปลงเป็นเลขอารบิกก่อนใช้เงื่อนไข", () => {
    expect(brief("ລ ໓໐ x໑໐໐", [pattern("ລ {N} x{A}", "{N}={A}ລ່າງ")])).toEqual(["30 BOTTOM LAK 100"]);
  });

  test("แทนคำให้คำยอดรวมแบบใหม่ใช้ตรวจยอดได้", () => {
    const parsed = parseTicket("32=50\nທັງໝົດ 60", { rules: [replace("ທັງໝົດ", "ລວມ")] });

    expect(parsed.declaredTotal).toBe(60);
    expect(parsed.issues.map((issue) => issue.code)).toEqual(["TOTAL_MISMATCH"]);
  });
});

describe("readRuleSchema", () => {
  const valid = { kind: "PATTERN" as const, find: "ລ {N} x{A}", replace: "{N}={A}ລ່າງ", note: "", isActive: true };
  const errorOf = (input: Record<string, unknown>) => {
    const result = readRuleSchema.safeParse({ ...valid, ...input });
    return result.success ? null : result.error.issues[0]!.message;
  };

  test("รูปแบบที่ถูกต้องผ่าน", () => {
    expect(errorOf({})).toBeNull();
    expect(errorOf({ kind: "REPLACE", find: "{", replace: "" })).toBeNull();
    expect(errorOf({ kind: "SKIP", find: "ໂອນແລ້ວ", replace: "" })).toBeNull();
  });

  test("ข้อความ error เป็นคีย์ i18n", () => {
    expect(errorOf({ find: "  " })).toBe("readRules.validation.findRequired");
    expect(errorOf({ find: "ລ 30" })).toBe("readRules.validation.patternNeedsSlot");
    expect(errorOf({ find: "{N} {A} {N}" })).toBe("readRules.validation.duplicateSlot");
    expect(errorOf({ find: "{X}" })).toBe("readRules.validation.unknownSlot");
    expect(errorOf({ replace: "" })).toBe("readRules.validation.replaceRequired");
    expect(errorOf({ replace: "{N}={B}" })).toBe("readRules.validation.slotNotInFind");
    expect(errorOf({ find: "a\nb" })).toBe("readRules.validation.oneLine");
  });
});
