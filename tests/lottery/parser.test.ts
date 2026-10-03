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
    expect(parseTicket("26.243=100ລ່າງ").issues.map((i) => i.code)).toEqual(["THREE_DIGIT_BOTTOM"]);
  });

  test("ຫລັກ2-9 → เติมหลักร้อยหน้าเลข 2 ตัวทุกตัวด้านบน เป็นเลข 3 ตัวบน", () => {
    const ticket = parseTicket("08-48-88=20\n05-45-85=20\nຫລັກ2-9=5", { lakMultiplier: 1 });
    const hundreds = ticket.bets.filter((b) => b.line === 3);

    expect(ticket.issues).toEqual([]);
    expect(hundreds.map((b) => b.number)).toEqual(
      ["208", "248", "288", "205", "245", "285", "908", "948", "988", "905", "945", "985"],
    );
    expect(hundreds.every((b) => b.digits === 3 && b.position === "TOP" && b.amount === 5)).toBe(true);
    expect(ticket.typedTotal).toBe(6 * 20 + 12 * 5);
  });

  test("ຫລັກ — เลขซ้ำด้านบนนับครั้งเดียว · ไม่มีเลข 2 ตัวด้านบน / ขอล่าง → รอตรวจ", () => {
    const codes = (text: string) => parseTicket(text).issues.map((i) => i.code);

    expect(parseTicket("08=20\n08=10ລ່າງ\nหลัก 3=5").bets.filter((b) => b.line === 3).map((b) => b.number)).toEqual([
      "308",
    ]);
    expect(codes("ຫລັກ2-9=5")).toEqual(["UNREADABLE"]);
    expect(codes("08=20\nຫລັກ2-9=5ລ່າງ")).toEqual(["THREE_DIGIT_BOTTOM"]);
    expect(codes("08=20\nຫລັກ23=5")).toEqual(["BAD_NUMBER"]);
  });

  test("ຫລັກ — บรรทัดเลข 2 ตัวไม่มียอดด้านบน = เลขฐานเท่านั้น · ໂຕ / ฿ / ລາວ · เอาแต่3โต เป็นหมายเหตุ", () => {
    const ticket = parseTicket("32 72 11 51 91\nຫຼັກ 1 .3 .5ໂຕ500฿ລາວ\nเอาแต่3โต");

    expect(ticket.issues).toEqual([]);
    expect(ticket.needsReview).toBe(false);
    expect(ticket.notes).toEqual(["เอาแต่3โต"]);
    expect(ticket.bets.map((b) => b.number)).toEqual(
      ["132", "172", "111", "151", "191", "332", "372", "311", "351", "391", "532", "572", "511", "551", "591"],
    );
    expect(ticket.bets.every((b) => b.digits === 3 && b.position === "TOP" && b.currency === "THB" && b.amount === 500)).toBe(
      true,
    );
    expect(ticket.typedTotal).toBe(15 * 500);
  });

  test("บรรทัดเลขไม่มียอดที่ไม่ได้ตามด้วย ຫລັກ ยังรอตรวจ", () => {
    expect(parseTicket("32 72 11\n45=20").issues.map((i) => i.code)).toEqual(["NO_AMOUNT"]);
    expect(parseTicket("32 72 11\nຫລັກ1=5ລ່າງ").issues.map((i) => i.code)).toEqual(["NO_AMOUNT", "THREE_DIGIT_BOTTOM"]);
  });

  test("หลายชุด เลขฐาน + ລັກN ไม่มียอด · ໂຕ20 ບລ ເອົາທັງ2-3ໂຕ ท้ายสุด = ยอดเดียวกันทุกชุด", () => {
    const message = [
      "04/44/84/17/57/97/08/48/88",
      "ລັກ2",
      "16/56/96/12/52/92/15/55/95",
      "ລັກ3",
      "22/62",
      "ລັກ8",
      "ໂຕ20 ບລ ເອົາທັງ2-3ໂຕ",
    ].join("\n");
    const ticket = parseTicket(message, { lakMultiplier: 1 });
    const brief = (line: number) =>
      ticket.bets.filter((b) => b.line === line).map((b) => `${b.number} ${b.position} ${b.amount}`);

    expect(ticket.issues).toEqual([]);
    expect(ticket.needsReview).toBe(false);
    // ชุดสุดท้าย: เลขฐานบน+ล่างลงแถวเลขฐาน · เลข 3 ตัวบนอย่างเดียวลงแถว ລັກ
    expect(brief(5)).toEqual(["22 TOP 20", "22 BOTTOM 20", "62 TOP 20", "62 BOTTOM 20"]);
    expect(brief(6)).toEqual(["822 TOP 20", "862 TOP 20"]);
    expect(brief(2)).toEqual(
      ["204", "244", "284", "217", "257", "297", "208", "248", "288"].map((n) => `${n} TOP 20`),
    );
    expect(brief(4).map((b) => b.split(" ")[0])).toEqual(["316", "356", "396", "312", "352", "392", "315", "355", "395"]);
    // เลขฐาน 20 ตัว × บน+ล่าง + เลข 3 ตัว 20 ตัว
    expect(ticket.bets).toHaveLength(20 * 2 + 20);
    expect(ticket.typedTotal).toBe(60 * 20);
  });

  test("ชุด ລັກ ไม่มียอด — ไม่มี ເອົາທັງ2-3 = เลข 3 ตัวอย่างเดียว · ไม่มีบรรทัดยอด / ไม่มีเลขฐาน → รอตรวจ", () => {
    const three = parseTicket("04/44\nລັກ2\n22\nລັກ8\nໂຕ20", { lakMultiplier: 1 });
    expect(three.issues).toEqual([]);
    expect(three.bets.map((b) => `${b.number} ${b.position}`)).toEqual(["204 TOP", "244 TOP", "822 TOP"]);

    // เลข 3 ตัวล้วนลงล่างไม่ได้
    expect(parseTicket("04/44\nລັກ2\nໂຕ20 ບລ").issues.map((i) => i.code)).toEqual(["NO_AMOUNT", "NO_AMOUNT", "THREE_DIGIT_BOTTOM"]);
    expect(parseTicket("04/44\nລັກ2").issues.map((i) => i.code)).toEqual(["NO_AMOUNT", "NO_AMOUNT"]);
    expect(parseTicket("ລັກ2\nໂຕ20").issues.map((i) => i.code)).toEqual(["UNREADABLE", "UNREADABLE"]);
    // ເອົາທັງ2-3ໂຕ แยกบรรทัดก่อนยอดก็ได้ และเก็บเป็นหมายเหตุ
    const both = parseTicket("04\nລັກ2\nເອົາທັງ2-3ໂຕ\n=20");
    expect(both.notes).toEqual(["ເອົາທັງ2-3ໂຕ"]);
    expect(both.bets.map((b) => b.number)).toEqual(["04", "204"]);
  });

  test("บรรทัดเลขเดี่ยวที่ไม่มียอดติดกัน ตามด้วยเลขเดี่ยวที่มียอด → ใช้ยอดเดียวกัน", () => {
    const ticket = parseTicket("919\n959\n999\n911\n951\n991\n914\n954\n994\n909\n949\n989=10");
    expect(ticket.issues).toEqual([]);
    expect(ticket.bets.map((b) => b.number)).toEqual(
      ["919", "959", "999", "911", "951", "991", "914", "954", "994", "909", "949", "989"],
    );
    expect(ticket.bets.map((b) => b.line)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(ticket.bets.every((b) => b.position === "TOP" && b.amount === 10_000)).toBe(true);
    expect(ticket.typedTotal).toBe(120);

    const both = parseTicket("32\n72=20ບລ", { lakMultiplier: 1 });
    expect(both.bets.map((b) => `${b.number} ${b.position} ${b.amount}`)).toEqual(
      ["32 TOP 20", "32 BOTTOM 20", "72 TOP 20", "72 BOTTOM 20"],
    );
  });

  test("โพยเลขเดี่ยวที่ copy มาจาก WhatsApp (อักขระล่องหน / ขีดนำหน้า / ตัวเต็มความกว้าง) → ยังใช้ยอดเดียวกัน", () => {
    const numbers = ["919", "959", "999", "911", "951", "991", "914", "954", "994", "909", "949"];
    const slip = [...numbers, "989=10"];
    const variants = {
      // LRM / RLM / bidi isolate ที่ WhatsApp Web/Desktop แทรกหน้า-หลังแต่ละบรรทัด
      lrm: slip.map((l) => `‎${l}`).join("\n"),
      rlm: slip.map((l) => `${l}‏`).join("\n"),
      isolate: slip.map((l) => `⁦${l}⁩`).join("\n"),
      firstOnly: `‎${slip.join("\n")}`,
      dash: [...numbers, "- 989=10"].join("\n"),
      dot: [...numbers, ".989=10"].join("\n"),
      fullWidthEquals: [...numbers, "989＝10"].join("\n"),
      fullWidthDigits: slip.join("\n").replace(/\d/g, (d) => String.fromCharCode(0xff10 + Number(d))),
    };
    for (const [name, text] of Object.entries(variants)) {
      const ticket = parseTicket(text);
      expect({ name, issues: ticket.issues }).toEqual({ name, issues: [] });
      expect(ticket.bets.map((b) => b.number)).toEqual([...numbers, "989"]);
      expect(ticket.bets.every((b) => b.position === "TOP" && b.amount === 10_000)).toBe(true);
      expect(ticket.typedTotal).toBe(120);
    }
  });

  test("เลขเดี่ยวไม่มียอด + บรรทัดหลายเลขที่มียอด → ใช้ยอดด้านล่าง (509,549,589 ໂຕ20)", () => {
    const ticket = parseTicket("09\n49\n89\n509,549,589 ໂຕ20\n009,049,089,043, 43ໂຕ20\nລາວ", { lakMultiplier: 1 });
    expect(ticket.issues).toEqual([]);
    expect(ticket.notes).toEqual(["ລາວ"]);
    expect(ticket.bets.map((b) => `${b.number} ${b.amount} @${b.line}`)).toEqual([
      "09 20 @1", "49 20 @2", "89 20 @3", "509 20 @4", "549 20 @4", "589 20 @4",
      "009 20 @5", "049 20 @5", "089 20 @5", "043 20 @5", "43 20 @5",
    ]);
    expect(parseTicket("919\n32 72=10").issues).toEqual([]);
  });

  test("เลขเดี่ยวไม่มียอดที่ไม่ได้ตามด้วยบรรทัดที่มียอด / ยอดใช้กับเลขไม่ได้ ยังรอตรวจ", () => {
    const codes = (text: string) => parseTicket(text).issues.map((i) => i.code);
    expect(codes("919\nລວມ10\n959=10")).toEqual(["NO_AMOUNT"]);
    expect(codes("919\n959=10ລ່າງ")).toEqual(["NO_AMOUNT", "THREE_DIGIT_BOTTOM"]);
    expect(codes("919\n59=10ລ່າງ")).toEqual(["NO_AMOUNT"]);
  });

  test("ປ່ອງ3 → ทุกเลขที่ไม่มียอดในบรรทัดติดกันด้านบน เลขละ 3", () => {
    const ticket = parseTicket("24\n64\n07\n47\n87\nປ່ອງ3");
    expect(ticket.issues).toEqual([]);
    expect(ticket.bets.map((b) => b.number)).toEqual(["24", "64", "07", "47", "87"]);
    expect(ticket.bets.map((b) => b.line)).toEqual([1, 2, 3, 4, 5]);
    expect(ticket.bets.every((b) => b.position === "TOP" && b.amount === 3000)).toBe(true);
    expect(ticket.typedTotal).toBe(15);

    // หลายเลขในบรรทัดเดียว + คำกำกับฝั่ง
    const both = parseTicket("24 64\n07\nປ່ອງ5ບລ", { lakMultiplier: 1 });
    expect(both.bets.map((b) => `${b.number} ${b.position} ${b.amount}`)).toEqual(
      ["24 TOP 5", "24 BOTTOM 5", "64 TOP 5", "64 BOTTOM 5", "07 TOP 5", "07 BOTTOM 5"],
    );
  });

  test("ຮູ3 / รู3 / ป่อง3 อ่านเหมือน ປ່ອງ3", () => {
    for (const word of ["ຮູ", "รู", "ป่อง", "ປອງ"]) {
      const ticket = parseTicket(`24\n64\n${word}3`);
      expect(ticket.issues).toEqual([]);
      expect(ticket.bets.map((b) => `${b.number} ${b.amount}`)).toEqual(["24 3000", "64 3000"]);
    }
  });

  test("บรรทัด ໂຕ10 / =10 ที่ไม่มีเลข → ทุกเลขที่ไม่มียอดด้านบน (ปน 2 และ 3 ตัว) เลขละ 10", () => {
    const ticket = parseTicket("173\n133\n350\n354\n73\n33\n50\n54\nໂຕ10", { lakMultiplier: 1 });
    expect(ticket.issues).toEqual([]);
    expect(ticket.bets.map((b) => `${b.number} ${b.position} ${b.amount}`)).toEqual(
      ["173 TOP 10", "133 TOP 10", "350 TOP 10", "354 TOP 10", "73 TOP 10", "33 TOP 10", "50 TOP 10", "54 TOP 10"],
    );
    expect(ticket.bets.map((b) => b.line)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(parseTicket("173\n33\n=10").issues).toEqual([]);
    // =ໂຕ5฿ / ໂຕ=5 — ใส่ทั้ง = และ ໂຕ
    const baht = parseTicket("211\n251\n291\n=ໂຕ5฿");
    expect(baht.issues).toEqual([]);
    expect(baht.bets.map((b) => `${b.number} ${b.position} ${b.currency} ${b.amount}`)).toEqual(
      ["211 TOP THB 5", "251 TOP THB 5", "291 TOP THB 5"],
    );
    expect(parseTicket("211\n251\nໂຕ=5").issues).toEqual([]);
    // ไม่มีเลขรอด้านบน → ยังรอตรวจ
    expect(parseTicket("33=5\nໂຕ10").issues.map((i) => i.code)).toEqual(["UNREADABLE"]);
  });

  test("หัวยอดก่อนเลข (ລາວ ບົນ-ລ່າງ ຮູ10) → ยอดของบรรทัดเลขที่ไม่มียอดด้านล่าง", () => {
    const ticket = parseTicket("ລາວ ບົນ-ລ່າງ ຮູ10\n\n08,80,02,20,93,39\n95,59,98,89,56,65", { lakMultiplier: 1 });
    expect(ticket.issues).toEqual([]);
    expect(ticket.declaredTotal).toBeNull(); // ລາວ ຮູ10 ไม่ใช่ยอดรวม
    expect(ticket.bets).toHaveLength(24);
    expect(ticket.bets.slice(0, 2).map((b) => `${b.number} ${b.position} ${b.amount} @${b.line}`)).toEqual(
      ["08 TOP 10 @3", "08 BOTTOM 10 @3"],
    );
    expect(ticket.bets.every((b) => b.amount === 10)).toBe(true);
    expect(ticket.typedTotal).toBe(240);

    // บรรทัดที่มียอดเองใช้ยอดของตัวเอง · หัวยอดใหม่แทนหัวเดิม
    const mixed = parseTicket("ໂຕ10\n123\n45=5\nບົນ ຮູ2฿\n67", { lakMultiplier: 1 });
    expect(mixed.issues).toEqual([]);
    expect(mixed.bets.map((b) => `${b.number} ${b.currency} ${b.amount}`)).toEqual(["123 LAK 10", "45 LAK 5", "67 THB 2"]);
  });

  test("หัวยอดที่ไม่มีเลขด้านล่าง / เลข 3 ตัวใต้หัวล่าง → รอตรวจ", () => {
    const codes = (text: string) => parseTicket(text).issues.map((i) => i.code);
    expect(codes("ລາວ ບົນ-ລ່າງ ຮູ10")).toEqual(["UNREADABLE"]);
    expect(codes("ລ່າງ ຮູ10\n123")).toEqual(["THREE_DIGIT_BOTTOM"]);
    expect(codes("ລາວ200,000")).toEqual([]);
  });

  test("06;46;506 hu 20 — hu = ຮູ · ; คั่นระหว่างเลขเมื่อมีคำคั่นยอดแล้ว", () => {
    const ticket = parseTicket("06;46;86;506;546;586 hu 20", { lakMultiplier: 1 });
    expect(ticket.issues).toEqual([]);
    expect(ticket.bets.map((b) => `${b.number} ${b.position} ${b.amount}`)).toEqual(
      ["06 TOP 20", "46 TOP 20", "86 TOP 20", "506 TOP 20", "546 TOP 20", "586 TOP 20"],
    );
    expect(parseTicket("06;46 HU20").issues).toEqual([]);
    // ไม่มีคำคั่นยอด → ; ยังเป็นตัวคั่นเลขกับยอดเหมือนเดิม
    expect(parseTicket("772;5", { lakMultiplier: 1 }).bets.map((b) => `${b.number} ${b.amount}`)).toEqual(["772 5"]);
  });

  test("ລວມ:1ລ້ານ / ລວມ5ແສນ = ยอดรวมเต็มจำนวน · บรรทัดอีโมจิ/ชื่อเป็นหมายเหตุ", () => {
    const ticket = parseTicket("19.59.99.32.72ຮູ200\nລວມ:1ລ້ານ\nແອ໋ມ💰✅");
    expect(ticket.issues).toEqual([]);
    expect(ticket.notes).toEqual(["ແອ໋ມ💰✅"]);
    expect(ticket.bets).toHaveLength(5);
    expect(ticket.bets.every((b) => b.amount === 200_000)).toBe(true);
    expect(ticket.declaredTotal).toBe(1000);
    expect(ticket.typedTotal).toBe(1000);

    expect(parseTicket("32=250\n72=250\nລວມ 5ແສນ").issues).toEqual([]);
    expect(parseTicket("32=750\n72=750\nລວມ1.5ລ້ານ").issues).toEqual([]);
    // ยอดรวมไม่ตรงยังเตือนเหมือนเดิม
    expect(parseTicket("32=100\nລວມ1ລ້ານ").issues.map((i) => i.code)).toEqual(["TOTAL_MISMATCH"]);
  });

  test("ຫລັກ ต่อท้ายบรรทัดเดียวกับรายการ → อ่านเหมือนขึ้นบรรทัดใหม่", () => {
    const ticket = parseTicket("16.56.96 .10.50.90.26.66.40.80=10₭ ຫລັກ 8=2₭", { lakMultiplier: 1 });
    expect(ticket.issues).toEqual([]);
    const brief = ticket.bets.map((b) => `${b.number} ${b.amount}`);
    expect(brief.slice(0, 10)).toEqual(
      ["16 10", "56 10", "96 10", "10 10", "50 10", "90 10", "26 10", "66 10", "40 10", "80 10"],
    );
    expect(brief.slice(10)).toEqual(
      ["816 2", "856 2", "896 2", "810 2", "850 2", "890 2", "826 2", "866 2", "840 2", "880 2"],
    );
    expect(ticket.bets.every((b) => b.line === 1 && b.position === "TOP" && b.currency === "LAK")).toBe(true);
    expect(ticket.typedTotal).toBe(10 * 10 + 10 * 2);
  });

  test("ພັນ / ພ ท้ายยอด = หลักพันกีบ ไม่มีผลกับรายการ (ไม่ต้องมีเงื่อนไขอ่านโพย)", () => {
    const ticket = parseTicket("633.336=30ພັນ\n33.36=50*20ພ");
    expect(ticket.issues).toEqual([]);
    expect(ticket.bets.map((b) => `${b.number} ${b.position} ${b.currency} ${b.amount}`)).toEqual([
      "633 TOP LAK 30000", "336 TOP LAK 30000",
      "33 TOP LAK 50000", "33 BOTTOM LAK 20000", "36 TOP LAK 50000", "36 BOTTOM LAK 20000",
    ]);
    expect(parseTicket("33=20พัน").issues).toEqual([]);
  });

  test("ตัวท้ายที่มี ພັນ / ພ / พัน / พ = ยอด แม้คั่นด้วย _ เหมือนเลข (32_72_29_69_5ພັນ)", () => {
    for (const word of ["ພັນ", "ພ", "พัน", "พ"]) {
      const ticket = parseTicket(`32_72_29_69_5${word}`);
      expect(ticket.issues).toEqual([]);
      expect(ticket.bets.map((b) => `${b.number} ${b.position} ${b.amount}`)).toEqual(
        ["32 TOP 5000", "72 TOP 5000", "29 TOP 5000", "69 TOP 5000"],
      );
    }
    expect(parseTicket("32 72 5ພັນບລ").bets).toHaveLength(4);
    // ไม่มีคำบอกหลักพัน → ไม่เดาว่าตัวท้ายเป็นยอด
    expect(parseTicket("32_72_29_69_5").issues.map((i) => i.code)).toEqual(["UNREADABLE"]);
  });

  test("22_10 — เลขเดียว + ขีดล่างตัวเดียว = ยอด · บรรทัด ລ່າງ เปล่า ๆ = เลขด้านบนลงล่าง", () => {
    const brief = (text: string) =>
      parseTicket(text, { lakMultiplier: 1 }).bets.map((b) => `${b.number} ${b.position} ${b.amount} @${b.line}`);
    const ticket = parseTicket("22_10\n62_10\nລ່າງ", { lakMultiplier: 1 });
    expect(ticket.issues).toEqual([]);
    expect(ticket.notes).toEqual([]);
    expect(ticket.typedTotal).toBe(20);
    expect(brief("22_10\n62_10\nລ່າງ")).toEqual(["22 BOTTOM 10 @1", "62 BOTTOM 10 @2"]);
    expect(brief("22_10\n62_10")).toEqual(["22 TOP 10 @1", "62 TOP 10 @2"]);
    // หลายขีดล่าง = ตัวคั่นเลขเหมือนเดิม
    expect(brief("04_44_84_=20")).toEqual(["04 TOP 20 @1", "44 TOP 20 @1", "84 TOP 20 @1"]);
    // ບລ เปล่า ๆ · เลขที่รับยอดจากด้านล่างก็เปลี่ยนฝั่งด้วย
    expect(brief("22=10\n33=5\nບລ")).toEqual(["22 TOP 10 @1", "22 BOTTOM 10 @1", "33 TOP 5 @2", "33 BOTTOM 5 @2"]);
    expect(brief("09\n49=20\nລ່າງ")).toEqual(["09 BOTTOM 20 @1", "49 BOTTOM 20 @2"]);
  });

  test("บรรทัด ລ່າງ เปล่า ๆ — บรรทัดด้านบนระบุฝั่งแล้ว = หมายเหตุ · เลข 3 ตัวลงล่างไม่ได้ = รอตรวจ", () => {
    const marked = parseTicket("22=10\n62=10ບລ\nລ່າງ");
    expect(marked.issues).toEqual([]);
    expect(marked.notes).toEqual(["ລ່າງ"]);
    expect(parseTicket("123=5\nລ່າງ").issues.map((i) => i.code)).toEqual(["THREE_DIGIT_BOTTOM"]);
    expect(parseTicket("ລ່າງ").notes).toEqual(["ລ່າງ"]);
  });

  test("92ປ່ອງ10 / 991ປ່ອງ2 — เลขด้านบนที่ไม่มียอดได้ยอดของบรรทัดล่าง แยกเป็นชุด ๆ", () => {
    const ticket = parseTicket(
      "11\n51\n91\n12\n52\n92ປ່ອງ10\n511\n591\n551\n911\n951\n512\n592\n552\n991ປ່ອງ2",
      { lakMultiplier: 1 },
    );
    expect(ticket.issues).toEqual([]);
    expect(ticket.bets.map((b) => `${b.number} ${b.amount}`)).toEqual([
      "11 10", "51 10", "91 10", "12 10", "52 10", "92 10",
      "511 2", "591 2", "551 2", "911 2", "951 2", "512 2", "592 2", "552 2", "991 2",
    ]);
    expect(ticket.typedTotal).toBe(6 * 10 + 9 * 2);
    expect(parseTicket("33 ຮູລະ5\n73ປ່ອງ 5").issues).toEqual([]);
  });

  test("เลขเดี่ยวไม่มียอดด้านบน + บรรทัดสุดท้าย บน×ล่าง (85=20*20) → ทุกเลขบน 20 ล่าง 20", () => {
    const ticket = parseTicket("55\n11\n56\n29\n14\n09\n89\n21\n05\n85=20*20", { lakMultiplier: 1 });
    expect(ticket.issues).toEqual([]);
    expect(ticket.bets).toHaveLength(20);
    expect(ticket.bets.slice(0, 2).map((b) => `${b.number} ${b.position} ${b.amount}`)).toEqual(["55 TOP 20", "55 BOTTOM 20"]);
    expect(ticket.bets.every((b) => b.amount === 20)).toBe(true);
    expect(ticket.typedTotal).toBe(400);
  });

  test("ປ່ອງ ที่ไม่มีเลขรอด้านบน / ยอดใช้กับเลขไม่ได้ → รอตรวจ", () => {
    const codes = (text: string) => parseTicket(text).issues.map((i) => i.code);
    expect(codes("24=5\nປ່ອງ3")).toEqual(["UNREADABLE"]);
    expect(codes("ປ່ອງ3")).toEqual(["UNREADABLE"]);
    expect(codes("24\n247\nປ່ອງ3ລ່າງ")).toEqual(["NO_AMOUNT", "NO_AMOUNT", "THREE_DIGIT_BOTTOM"]);
    expect(codes("24\nລວມ3\nປ່ອງ3")).toEqual(["NO_AMOUNT", "UNREADABLE"]);
  });

  test("บน+ล่างที่มีเลข 2 ตัวปน → เลข 3 ตัวลงบนอย่างเดียว แยกลงแถวใหม่ต่อท้าย", () => {
    const brief = (text: string) =>
      parseTicket(text, { lakMultiplier: 1 }).bets.map((b) => `${b.number} ${b.position} ${b.amount}`);

    expect(brief("26.590.90=10ບລ")).toEqual([
      "26 TOP 10",
      "26 BOTTOM 10",
      "90 TOP 10",
      "90 BOTTOM 10",
      "590 TOP 10",
    ]);
    expect(brief("590.26=10*20")).toEqual(["26 TOP 10", "26 BOTTOM 20", "590 TOP 10"]);
    // ไม่มี ບລ → คงลำดับตามที่พิมพ์
    expect(brief("590.26=10")).toEqual(["590 TOP 10", "26 TOP 10"]);
    expect(parseTicket("26.66.590.10.50.90=10ບລ").issues).toEqual([]);
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
