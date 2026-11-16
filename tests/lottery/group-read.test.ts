import { describe, expect, test } from "bun:test";

import { groupParseOptions } from "@/lottery/group-read";
import { parseTicket, type ParsedBet } from "@/lottery/parser";

/** ย่อรายการแทงเป็นข้อความบรรทัดเดียว: "เลข ฝั่ง สกุล ยอด" */
const brief = (bets: ParsedBet[]) => bets.map((b) => `${b.number} ${b.position} ${b.currency} ${b.amount}`);

describe("ตั้งค่ากลุ่ม: เลข 3 ตัวแทงบน-ล่าง (threeDigitBottom)", () => {
  test("ปิด (ค่าเริ่มต้น) — 3 ตัว ບລ ลงบนอย่างเดียว · ล่างล้วน = รอตรวจ", () => {
    expect(brief(parseTicket("123=10ບລ").bets)).toEqual(["123 TOP LAK 10000"]);
    expect(parseTicket("689=ລ10").issues[0]?.code).toBe("THREE_DIGIT_BOTTOM");
  });

  test("เปิด — 3 ตัว ບລ ลงทั้งบนและล่าง", () => {
    const ticket = parseTicket("123=10ບລ", { threeDigitBottom: true });
    expect(ticket.issues).toEqual([]);
    expect(brief(ticket.bets)).toEqual(["123 TOP LAK 10000", "123 BOTTOM LAK 10000"]);
  });

  test("เปิด — 3 ตัวล่างล้วน และ บน×ล่าง ใช้ยอดแยกฝั่ง", () => {
    expect(brief(parseTicket("689=ລ10", { threeDigitBottom: true }).bets)).toEqual(["689 BOTTOM LAK 10000"]);
    expect(brief(parseTicket("45.689=20*10", { threeDigitBottom: true }).bets)).toEqual([
      "45 TOP LAK 20000",
      "45 BOTTOM LAK 10000",
      "689 TOP LAK 20000",
      "689 BOTTOM LAK 10000",
    ]);
  });

  test("ค่าไม่ค้างไปโพยถัดไป", () => {
    parseTicket("123=10ບລ", { threeDigitBottom: true });
    expect(brief(parseTicket("123=10ບລ").bets)).toEqual(["123 TOP LAK 10000"]);
  });
});

describe("ตั้งค่ากลุ่ม: สกุลเงินเริ่มต้น (defaultCurrency)", () => {
  test("โพยไม่ระบุสกุลเงิน → ใช้สกุลของกลุ่ม (บาทไม่คูณตัวคูณกีบ)", () => {
    expect(brief(parseTicket("12=10", { defaultCurrency: "THB" }).bets)).toEqual(["12 TOP THB 10"]);
    expect(brief(parseTicket("12=10", { defaultCurrency: "LAK" }).bets)).toEqual(["12 TOP LAK 10000"]);
  });

  test("โพยระบุสกุลเงินเอง → ตามที่ระบุ", () => {
    expect(brief(parseTicket("12=10ກີບ", { defaultCurrency: "THB" }).bets)).toEqual(["12 TOP LAK 10000"]);
    // โพยที่มีคำบอกกีบ บรรทัดที่ไม่ระบุสกุลเป็นกีบตามเดิม
    expect(brief(parseTicket("12=10\n34=5ກີບ", { defaultCurrency: "THB" }).bets)).toEqual([
      "12 TOP LAK 10000",
      "34 TOP LAK 5000",
    ]);
    expect(brief(parseTicket("12=10฿", { defaultCurrency: "LAK" }).bets)).toEqual(["12 TOP THB 10"]);
  });

  test("groupParseOptions: ไม่มีกลุ่ม = ค่าเริ่มต้นของระบบ", () => {
    expect(groupParseOptions(null)).toEqual({});
    expect(groupParseOptions({ threeDigitBottom: true, currency: "THB" })).toEqual({
      threeDigitBottom: true,
      defaultCurrency: "THB",
    });
  });
});
