import { describe, expect, test } from "bun:test";

import { parseTicket, type ParsedBet } from "@/lottery/parser";

/** ย่อรายการแทงเป็นข้อความบรรทัดเดียว: "เลข ฝั่ง สกุล ยอด" */
const brief = (bets: ParsedBet[]) => bets.map((b) => `${b.number} ${b.position} ${b.currency} ${b.amount}`);

describe("parseTicket — ข้อความตัวอย่างจากกลุ่ม", () => {
  test("243=150 → 3 ตัวบน กีบคูณ 1,000", () => {
    const ticket = parseTicket("243=150");
    expect(brief(ticket.bets)).toEqual(["243 TOP LAK 150000"]);
    expect(ticket.bets[0].digits).toBe(3);
    expect(ticket.needsReview).toBe(false);
  });

  test("หลายเลขคั่นด้วยจุด ได้ยอดเท่ากันทุกเลข", () => {
    const ticket = parseTicket("819.859.899.419.459.499=50");
    expect(ticket.bets).toHaveLength(6);
    expect(ticket.bets.every((b) => b.position === "TOP" && b.amount === 50_000)).toBe(true);
    expect(ticket.typedTotal).toBe(300);
  });

  test("หลายบรรทัดในข้อความเดียว = โพยเดียว", () => {
    const ticket = parseTicket("30.70=200\n32.72=300");
    expect(brief(ticket.bets)).toEqual([
      "30 TOP LAK 200000",
      "70 TOP LAK 200000",
      "32 TOP LAK 300000",
      "72 TOP LAK 300000",
    ]);
    expect(ticket.bets.map((b) => b.line)).toEqual([1, 1, 2, 2]);
  });

  test("ລ່າງ = ล่าง", () => {
    const ticket = parseTicket("30.70=100ລ່າງ\n32.72=200ລ່າງ");
    expect(brief(ticket.bets)).toEqual([
      "30 BOTTOM LAK 100000",
      "70 BOTTOM LAK 100000",
      "32 BOTTOM LAK 200000",
      "72 BOTTOM LAK 200000",
    ]);
  });

  test("฿ = บาท ไม่คูณ และคั่นเลขด้วยขีดได้", () => {
    expect(brief(parseTicket("788-778-678=300฿").bets)).toEqual([
      "788 TOP THB 300",
      "778 TOP THB 300",
      "678 TOP THB 300",
    ]);
  });

  test("1000*1000฿ = บน 1000 × ล่าง 1000", () => {
    const ticket = parseTicket("78.87=1000*1000฿");
    expect(brief(ticket.bets)).toEqual([
      "78 TOP THB 1000",
      "78 BOTTOM THB 1000",
      "87 TOP THB 1000",
      "87 BOTTOM THB 1000",
    ]);
    expect(ticket.typedTotal).toBe(4000);
  });

  test("ບລ = บนและล่างฝั่งละเท่ายอดที่พิมพ์", () => {
    const ticket = parseTicket("38.78.33.73=300ບລ");
    expect(ticket.bets).toHaveLength(8);
    expect(brief(ticket.bets).slice(0, 2)).toEqual(["38 TOP LAK 300000", "38 BOTTOM LAK 300000"]);
    expect(ticket.typedTotal).toBe(2400);
  });

  test("คั่นเลขด้วย / ได้", () => {
    expect(parseTicket("232/272/432/472=150").bets.map((b) => b.number)).toEqual(["232", "272", "432", "472"]);
  });

  test("โพยที่มียอดรวม (ລວມ) ตรงกับที่คิดได้", () => {
    const ticket = parseTicket(
      ["74=20", "574=10", "47=20", "547=10", "", "77=20", "577=10", "", "87=20", "587=10", "", "78=20", "578=10", "ລວມ150"].join(
        "\n",
      ),
    );
    expect(ticket.bets).toHaveLength(10);
    expect(ticket.declaredTotal).toBe(150);
    expect(ticket.typedTotal).toBe(150);
    expect(ticket.needsReview).toBe(false);
  });

  test("รูปแบบ เลข-ยอด และเลขลาว", () => {
    const ticket = parseTicket("762-໕\n35-5\nລວມ10");
    expect(brief(ticket.bets)).toEqual(["762 TOP LAK 5000", "35 TOP LAK 5000"]);
    expect(ticket.needsReview).toBe(false);
  });

  test("รูปแบบ เลข;ยอด — บรรทัดที่ไม่มียอดเข้าคิวรอตรวจ", () => {
    const ticket = parseTicket("772;5\n319;10\n399");
    expect(brief(ticket.bets)).toEqual(["772 TOP LAK 5000", "319 TOP LAK 10000"]);
    expect(ticket.issues).toEqual([{ code: "NO_AMOUNT", line: 3, text: "399" }]);
    expect(ticket.needsReview).toBe(true);
  });
});

describe("parseTicket — กติกา", () => {
  test("ตัวคูณกีบตั้งค่าได้ และไม่มีผลกับบาท", () => {
    expect(brief(parseTicket("32=150000\n72=300฿", { lakMultiplier: 1 }).bets)).toEqual([
      "32 TOP LAK 150000",
      "72 TOP THB 300",
    ]);
  });

  test("คงศูนย์นำหน้าของเลข", () => {
    expect(parseTicket("06.00=10").bets.map((b) => b.number)).toEqual(["06", "00"]);
  });

  test("คำกำกับสลับลำดับและเขียนแบบไทยได้", () => {
    expect(brief(parseTicket("32=100฿ລ່າງ\n72=100 ล่าง บาท\n11=50 บน").bets)).toEqual([
      "32 BOTTOM THB 100",
      "72 BOTTOM THB 100",
      "11 TOP LAK 50000",
    ]);
  });

  test("มีช่องว่างรอบเครื่องหมายและยอดคั่นหลักพันได้", () => {
    expect(brief(parseTicket("74 = 1,000 ฿").bets)).toEqual(["74 TOP THB 1000"]);
  });

  test("ตัดอักขระล่องหนที่ติดมากับการ copy", () => {
    const zeroWidthSpace = String.fromCharCode(0x200b);
    expect(brief(parseTicket(`${zeroWidthSpace}32=1${zeroWidthSpace}00`).bets)).toEqual(["32 TOP LAK 100000"]);
  });

  test("ยอดรวมไม่ตรง → รอตรวจ", () => {
    const ticket = parseTicket("74=20\n47=20\nລວມ50");
    expect(ticket.bets).toHaveLength(2);
    expect(ticket.issues.map((i) => i.code)).toEqual(["TOTAL_MISMATCH"]);
  });

  test("เลข 3 ตัวลงล่างไม่ได้ → รอตรวจ ไม่สร้างรายการ", () => {
    for (const text of ["243=100ລ່າງ", "243=100ບລ", "243=100*100"]) {
      const ticket = parseTicket(text);
      expect(ticket.bets).toEqual([]);
      expect(ticket.issues.map((i) => i.code)).toEqual(["THREE_DIGIT_BOTTOM"]);
    }
  });

  test("เลขที่ไม่ใช่ 2 หรือ 3 หลัก → รอตรวจ", () => {
    expect(parseTicket("5=100").issues.map((i) => i.code)).toEqual(["BAD_NUMBER"]);
    expect(parseTicket("1234=100").issues.map((i) => i.code)).toEqual(["BAD_NUMBER"]);
  });

  test("ไม่เดาบรรทัดที่กำกวม", () => {
    const codes = (text: string) => parseTicket(text).issues.map((i) => i.code);
    expect(codes("788-778-678")).toEqual(["NO_AMOUNT"]);
    expect(codes("32=")).toEqual(["NO_AMOUNT"]);
    expect(codes("32=100ບ")).toEqual(["UNREADABLE"]); // ບ ตัวเดียว: ບົນ หรือ ບາດ
    expect(codes("32=100*100ລ່າງ")).toEqual(["UNREADABLE"]);
    expect(codes("32=100=200")).toEqual(["UNREADABLE"]);
    expect(codes("32=0")).toEqual(["UNREADABLE"]);
    expect(codes("35 5")).toEqual(["UNREADABLE"]);
  });

  test("บรรทัดที่ไม่มีตัวเลขเก็บเป็นหมายเหตุ ไม่นับเป็นปัญหา", () => {
    const ticket = parseTicket("ເອື້ອຍນ້ອຍ\n32=100");
    expect(ticket.notes).toEqual(["ເອື້ອຍນ້ອຍ"]);
    expect(ticket.bets).toHaveLength(1);
    expect(ticket.needsReview).toBe(false);
  });

  test("คั่นเลขด้วยขีดล่าง (มีขีดล่างค้างท้ายได้)", () => {
    const ticket = parseTicket("04_44_84_05_45_85_=20");
    expect(ticket.bets.map((b) => b.number)).toEqual(["04", "44", "84", "05", "45", "85"]);
    expect(ticket.bets.every((b) => b.amount === 20_000)).toBe(true);
  });

  test("หลายเลขคั่นด้วยช่องว่าง + ขีดตัวเดียวคั่นยอด", () => {
    const ticket = parseTicket("570 57 70 50 22 62 02 42 82-30,000");
    expect(ticket.bets).toHaveLength(9);
    expect(ticket.bets[0]).toMatchObject({ number: "570", digits: 3, position: "TOP" });
    // หลังขีดเป็นเลข 2-3 หลักเปล่า ๆ → ไม่เดา (อาจเป็นเลขทั้งหมด)
    expect(parseTicket("38.78-33").issues.map((i) => i.code)).toEqual(["NO_AMOUNT"]);
  });

  test("ໂຕ / ตัว = เลขละ", () => {
    expect(brief(parseTicket("33 73 073 ໂຕ 20").bets)).toEqual([
      "33 TOP LAK 20000",
      "73 TOP LAK 20000",
      "073 TOP LAK 20000",
    ]);
    expect(parseTicket("33 73 ตัว 20ล่าง").bets).toHaveLength(2);
  });

  test("ยอดกีบตั้งแต่ 10,000 (หรือ 10.000) พิมพ์เต็มจำนวนแล้ว ไม่คูณ", () => {
    expect(brief(parseTicket("32=10.000\n33=10,000\n34=9999").bets)).toEqual([
      "32 TOP LAK 10000",
      "33 TOP LAK 10000",
      "34 TOP LAK 9999000",
    ]);
    expect(brief(parseTicket("32=20,000฿").bets)).toEqual(["32 TOP THB 20000"]);
    // ยอดรวมเทียบในหน่วยย่อ: 20 + 30,000 = 50 = ລວມ50,000
    const ticket = parseTicket("32=20\n33=30,000\nລວມ50,000");
    expect(ticket.typedTotal).toBe(50);
    expect(ticket.declaredTotal).toBe(50);
    expect(ticket.needsReview).toBe(false);
  });

  test("ລາວ200,000 = ยอดรวมที่แจ้ง", () => {
    const ticket = parseTicket("01-41-81-30-70-19-59-99:20\n501-541-581-530-570-519-559-599:5\nລາວ200,000");
    expect(ticket.bets).toHaveLength(16);
    expect(ticket.declaredTotal).toBe(200);
    expect(ticket.issues.map((i) => i.code)).toEqual([]);
  });

  test("ข้อความที่มีแต่ยอดรวม (ส่งแยกข้อความ) คืนยอดรวมโดยไม่มีรายการ", () => {
    const ticket = parseTicket("ລວມ150");
    expect(ticket.bets).toEqual([]);
    expect(ticket.declaredTotal).toBe(150);
    expect(ticket.needsReview).toBe(false);
  });
});
