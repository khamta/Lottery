import { describe, expect, test } from "bun:test";

import { BUILT_IN_READ_RULES } from "@/lottery/built-in-read-rules";
import { parseTicket } from "@/lottery/parser";
import { applyReadRules, compilePattern, prepareReadRules } from "@/lottery/read-rules";

/** เงื่อนไขที่ติดมากับระบบ (built-in-read-rules.ts) — ใช้กับทุกแม่หวยโดยไม่ต้องตั้งเอง */
const rewrite = (line: string) => applyReadRules(line, prepareReadRules([]));
const brief = (text: string) => {
  const ticket = parseTicket(text);
  return ticket.issues.length
    ? ticket.issues.map((issue) => issue.code)
    : ticket.bets.map((b) => `${b.number} ${b.position} ${b.currency} ${b.amount}`);
};

describe("เงื่อนไขอ่านโพยที่ติดมากับระบบ", () => {
  test("ทุกข้อเป็นรูปแบบที่ใช้ได้ และไม่มีข้อซ้ำ", () => {
    for (const rule of BUILT_IN_READ_RULES) expect([rule.find, compilePattern(rule.find)]).not.toEqual([rule.find, null]);
    const finds = BUILT_IN_READ_RULES.map((rule) => rule.find.toLowerCase());
    expect(new Set(finds).size).toBe(finds.length);
  });

  test("แปลงแต่ละรูปแบบเป็นรูปแบบมาตรฐาน", () => {
    const cases: [string, string][] = [
      ["32ບ່ອງລະ5", "32=5"],
      ["32_5ພັນ", "32=5"],
      ["32 50฿", "32=50ບາດ"],
      ["32.ໂຕລະ5ພັນເດີ້", "32=5"],
      ["32=5ກີບບົນ", "32=5ບົນ"],
      ["32=5ກີບລ່າງ", "32=5ລ່າງ"],
      ["32=5ກີບລາວ", "32=5"],
      ["32ຊູ5", "32=5"],
      ["32 5", "32=5"],
      ["32 ຮູລະແສນ", "32=100"],
      ["32 ຮູ5", "32=5"],
      ["32=5ພັນ", "32=5"],
      ["32=5ພັນ ບລ", "32=5ບລ"],
      ["32=5ບລ", "32=5ບລ"],
      ["1-=5ຫລັກ=3", "1-=5ຫລັກ=3"],
      ["32/ຊູ5", "32=5"],
      ["32=5la", "32=5"],
      ["32/ຂ5", "32=5"],
      ["32 hu 5", "32=5"],
      ["32ໂຕ5k", "32=5"],
      ["32ໂຕ5kບລ", "32=5ບລ"],
      ["32,ຊູ5ກີບ ນາງ", "32=5"],
      ["ອ້າຍ 32ຊູລະ 5 ແດ່", "32=5"],
      ["32=50B", "32=50ບາດ"],
      ["32=50b", "32=50ບາດ"],
      ["32-5k", "32=5"],
      ["ລ່າງ32=5", "32=5ລ່າງ"],
    ];
    for (const [line, expected] of cases) expect([line, rewrite(line)]).toEqual([line, expected]);
  });

  test("บน*ล่าง เก็บยอดล่าง {B} แยกจากยอดบน (ไม่ใช้ยอดบนเป็นยอดล่าง)", () => {
    expect(brief("32=20ພັນ*10ພັນ")).toEqual(["32 TOP LAK 20000", "32 BOTTOM LAK 10000"]);
    expect(brief("32ຊູ20*10")).toEqual(["32 TOP LAK 20000", "32 BOTTOM LAK 10000"]);
    expect(brief("32=20฿*10฿")).toEqual(["32 TOP THB 20", "32 BOTTOM THB 10"]);
    expect(brief("32:20฿*10฿")).toEqual(["32 TOP THB 20", "32 BOTTOM THB 10"]);
    // ยอดเท่ากัน = ผลเดียวกับ ບລ
    expect(brief("32=20฿*20฿")).toEqual(brief("32=20ບາດບລ"));
  });

  test("เงื่อนไขของแม่หวยมาก่อน — สอนรูปแบบเดียวกันให้ได้ผลต่างได้", () => {
    const own = [{ kind: "PATTERN" as const, find: "{N} {A}", replace: "{N}={A}ລ່າງ" }];
    expect(applyReadRules("32 5", prepareReadRules(own))).toBe("32=5ລ່າງ");
  });

  // ผู้ใช้เลือกให้ "{N} {A}" ใช้กับทุกแม่หวย ทั้งที่รู้ว่าบรรทัดเลขล้วนเว้นวรรคจะถูกอ่านเป็น เลข=ยอด —
  // บันทึกผลจริงไว้ตรงนี้ ถ้าวันหนึ่งเปลี่ยนใจ เทสต์นี้คือจุดที่ต้องแก้ (ไวยากรณ์เดิมของตัวแยกยังทดสอบใน parser.test.ts ด้วย parseNative)
  test('ข้อแลกเปลี่ยนของ "{N} {A}": บรรทัดเลขล้วนเว้นวรรคกลายเป็น เลข=ยอด', () => {
    expect(brief("35 50")).toEqual(["35 TOP LAK 50000"]);
    // ປ່ອງ ไม่เหลือเลขไม่มียอดด้านบนให้ใช้ → โพยรอตรวจ (ไม่นับยอดผิดเงียบ ๆ)
    expect(brief("24 64\nປ່ອງ3")).toEqual(["UNREADABLE"]);
    expect(rewrite("020 555 1234")).toBe("020 555=1234");
  });
});
