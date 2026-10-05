import { describe, expect, test } from "bun:test";

import { parseTicket, type ParsedBet } from "@/lottery/parser";

/** ย่อรายการแทงเป็นข้อความบรรทัดเดียว: "เลข ฝั่ง สกุล ยอด" */
/**
 * ตัวแยกล้วน ๆ ไม่มีเงื่อนไขที่ติดมากับระบบ — ใช้ในเทสต์ไวยากรณ์ที่กฎ "{N} {A}" ของระบบเปลี่ยนผล
 * (บรรทัดเลขล้วนเว้นวรรคถูกอ่านเป็น เลข=ยอด — ผลจริงในระบบดู built-in-read-rules.test.ts)
 */
const parseNative = (text: string, options: Parameters<typeof parseTicket>[1] = {}) =>
  parseTicket(text, { ...options, builtInRules: false });
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

  test("เลข 3 ตัวลงล่างอย่างเดียวไม่ได้ → รอตรวจ ไม่สร้างรายการ", () => {
    const ticket = parseTicket("243=100ລ່າງ");
    expect(ticket.bets).toEqual([]);
    expect(ticket.issues.map((i) => i.code)).toEqual(["THREE_DIGIT_BOTTOM"]);
    expect(parseTicket("26.243=100ລ່າງ").issues.map((i) => i.code)).toEqual(["THREE_DIGIT_BOTTOM"]);
  });

  test("บนล่าง (ບລ / บน×ล่าง) ใช้ได้เฉพาะเลข 2 ตัว → เลข 3 ตัวลงบนอย่างเดียวด้วยยอดบน", () => {
    const brief = (text: string) =>
      parseTicket(text, { lakMultiplier: 1 }).bets.map((b) => `${b.number} ${b.position} ${b.amount}`);
    expect(brief("243=100ບລ")).toEqual(["243 TOP 100"]);
    expect(brief("243=100*50")).toEqual(["243 TOP 100"]);
    expect(parseTicket("243=100ບລ").issues).toEqual([]);
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
    const ticket = parseNative("32 72 11 51 91\nຫຼັກ 1 .3 .5ໂຕ500฿ລາວ\nเอาแต่3โต");

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
    expect(parseNative("32 72 11\n45=20").issues.map((i) => i.code)).toEqual(["NO_AMOUNT"]);
    expect(parseNative("32 72 11\nຫລັກ1=5ລ່າງ").issues.map((i) => i.code)).toEqual(["NO_AMOUNT", "THREE_DIGIT_BOTTOM"]);
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

    // เลข 3 ตัวล้วน + ບລ → ลงบนอย่างเดียว · ລ່າງ ล้วนลงไม่ได้
    const threeBoth = parseTicket("04/44\nລັກ2\nໂຕ20 ບລ", { lakMultiplier: 1 });
    expect(threeBoth.issues).toEqual([]);
    expect(threeBoth.bets.map((b) => `${b.number} ${b.position}`)).toEqual(["204 TOP", "244 TOP"]);
    expect(parseTicket("04/44\nລັກ2\nໂຕ20 ລ່າງ").issues.map((i) => i.code)).toEqual(["NO_AMOUNT", "NO_AMOUNT", "THREE_DIGIT_BOTTOM"]);
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
    const ticket = parseNative("24\n64\n07\n47\n87\nປ່ອງ3");
    expect(ticket.issues).toEqual([]);
    expect(ticket.bets.map((b) => b.number)).toEqual(["24", "64", "07", "47", "87"]);
    expect(ticket.bets.map((b) => b.line)).toEqual([1, 2, 3, 4, 5]);
    expect(ticket.bets.every((b) => b.position === "TOP" && b.amount === 3000)).toBe(true);
    expect(ticket.typedTotal).toBe(15);

    // หลายเลขในบรรทัดเดียว + คำกำกับฝั่ง
    const both = parseNative("24 64\n07\nປ່ອງ5ບລ", { lakMultiplier: 1 });
    expect(both.bets.map((b) => `${b.number} ${b.position} ${b.amount}`)).toEqual(
      ["24 TOP 5", "24 BOTTOM 5", "64 TOP 5", "64 BOTTOM 5", "07 TOP 5", "07 BOTTOM 5"],
    );
  });

  test("ປອ່ງ (วางไม้เอกผิดที่) อ่านเหมือน ປ່ອງ", () => {
    const ticket = parseTicket("379.793.396.397ປອ່ງ5\n79.93.96.97ປອ່ງ10", { lakMultiplier: 1 });
    expect(ticket.issues).toEqual([]);
    expect(ticket.bets.map((b) => `${b.number} ${b.amount}`)).toEqual(
      ["379 5", "793 5", "396 5", "397 5", "79 10", "93 10", "96 10", "97 10"],
    );
    expect(parseTicket("24\n64\nປອ່ງ3").issues).toEqual([]);
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

  test("90 91 960 / 06 906:20 — บรรทัดที่มีเลข 3 ตัวไม่มียอดได้ยอดของบรรทัดล่าง (: คั่นยอด)", () => {
    const ticket = parseNative("90 91 960\n06 906:20");
    expect(ticket.issues).toEqual([]);
    expect(ticket.bets.map((b) => `${b.number} ${b.amount} @${b.line}`)).toEqual([
      "90 20000 @1", "91 20000 @1", "960 20000 @1", "06 20000 @2", "906 20000 @2",
    ]);
  });

  test("หลายชุด เลข=ยอด ในบรรทัดเดียว (10.50=3 510.550=1)", () => {
    const ticket = parseTicket("10.50.90.26.66=3 510.550.590.526.566=1", { lakMultiplier: 1 });
    expect(ticket.issues).toEqual([]);
    expect(ticket.bets.map((b) => `${b.number} ${b.amount}`)).toEqual([
      "10 3", "50 3", "90 3", "26 3", "66 3", "510 1", "550 1", "590 1", "526 1", "566 1",
    ]);
    expect(ticket.bets.every((b) => b.line === 1)).toBe(true);
    const brief = (text: string) => parseTicket(text, { lakMultiplier: 1 }).bets.map((b) => `${b.number} ${b.position} ${b.amount}`);
    expect(brief("32=10 72=5ບລ 123=2")).toEqual(["32 TOP 10", "72 TOP 5", "72 BOTTOM 5", "123 TOP 2"]);
    // ตัวคั่นค้างหน้า = ในชุดถัดไป ("93.=5")
    const trailing = parseTicket("11.51.91=5 31.71.09.49.89.22.62.13.53.93.=5", { lakMultiplier: 1 });
    expect(trailing.issues).toEqual([]);
    expect(trailing.bets.map((b) => b.number)).toEqual(["11", "51", "91", "31", "71", "09", "49", "89", "22", "62", "13", "53", "93"]);
    expect(trailing.bets.every((b) => b.position === "TOP" && b.amount === 5)).toBe(true);
    // ตัวคั่นค้างระหว่างชุด (" ../")
    const dotted = parseTicket(
      "11-51-91-00-01-10-20-60=5 ../211-251-291-400-420-460-700-701-00-11-09-49-89-06-46-86-106-=3",
      { lakMultiplier: 1 },
    );
    expect(dotted.issues).toEqual([]);
    expect(dotted.bets.filter((b) => b.amount === 5)).toHaveLength(8);
    expect(dotted.bets.filter((b) => b.amount === 3).map((b) => b.number)).toEqual([
      "211", "251", "291", "400", "420", "460", "700", "701", "00", "11", "09", "49", "89", "06", "46", "86", "106",
    ]);
    // = หลายตัวโดยไม่มีเลขชุดใหม่คั่น → ยังรอตรวจ
    expect(parseTicket("32=100=200").issues.map((i) => i.code)).toEqual(["UNREADABLE"]);
  });

  test("ตัวท้ายเป็น บน*ล่าง = ยอด ไม่ว่าคั่นด้วยอะไร (14/7*7)", () => {
    const ticket = parseTicket(
      "14/7*7\n54\n94\n18\n58\n98/7*7\n01/7*5\n41/5*5\n81/5*5\n30/5*5\n70/5*5\n24/3*3\n64/5*5\n46/3*3\n114/5\n154\n194/5\n701/3\n791/3\n912/3\n058/3\n396/3\n402/3",
      { lakMultiplier: 1 },
    );
    expect(ticket.issues).toEqual([]);
    const at = (n: number) => ticket.bets.filter((b) => b.line === n).map((b) => `${b.number} ${b.position} ${b.amount}`);
    expect(at(2)).toEqual(["54 TOP 7", "54 BOTTOM 7"]);
    expect(at(7)).toEqual(["01 TOP 7", "01 BOTTOM 5"]);
    expect(at(16)).toEqual(["154 TOP 5"]);
    expect(at(21)).toEqual(["058 TOP 3"]);
    expect(ticket.bets).toHaveLength(37);

    const brief = (text: string) => parseTicket(text, { lakMultiplier: 1 }).bets.map((b) => `${b.number} ${b.position} ${b.amount}`);
    expect(brief("32 72 50*50")).toEqual(["32 TOP 50", "32 BOTTOM 50", "72 TOP 50", "72 BOTTOM 50"]);
    expect(brief("243/5*5")).toEqual(["243 TOP 5"]);
  });

  test("ตัวท้ายเป็นเลขหลักเดียว = ยอดเสมอ (ไม่มีใครแทงเลขตัวเดียว) ไม่ว่าคั่นด้วยอะไร", () => {
    const brief = (text: string) =>
      parseTicket(text, { lakMultiplier: 1 }).bets.map((b) => `${b.number} ${b.position} ${b.amount}`);
    expect(brief("030/3\n070/3")).toEqual(["030 TOP 3", "070 TOP 3"]);
    expect(brief("030 3")).toEqual(["030 TOP 3"]);
    expect(brief("030.3")).toEqual(["030 TOP 3"]);
    expect(brief("35 5")).toEqual(["35 TOP 5"]);
    expect(brief("32_72_5")).toEqual(["32 TOP 5", "72 TOP 5"]);
    expect(brief("32 72 5ບລ")).toEqual(["32 TOP 5", "32 BOTTOM 5", "72 TOP 5", "72 BOTTOM 5"]);
  });

  test("/ + เลขหลักเดียว = ยอด · บรรทัดต่อที่มีเลข 3 ตัวได้ยอดของบรรทัดล่าง", () => {
    const ticket = parseTicket("19.59.99.06.46.86.18.58.98/2\n506.546\n 586.599.598/1", { lakMultiplier: 1 });
    expect(ticket.issues).toEqual([]);
    expect(ticket.bets.map((b) => `${b.number} ${b.amount} @${b.line}`)).toEqual([
      "19 2 @1", "59 2 @1", "99 2 @1", "06 2 @1", "46 2 @1", "86 2 @1", "18 2 @1", "58 2 @1", "98 2 @1",
      "506 1 @2", "546 1 @2", "586 1 @3", "599 1 @3", "598 1 @3",
    ]);
    expect(ticket.typedTotal).toBe(9 * 2 + 5 * 1);
    // หลายเลขคั่นด้วย / และหลัง / ตัวสุดท้ายเป็นเลข 2-3 หลัก → ยังเป็นเลขแทงทั้งหมด
    expect(parseTicket("32/72/50").issues.map((i) => i.code)).toEqual(["NO_AMOUNT"]);
  });

  test("เลขเดียว / ยอด (96/50) = เลข 96 ยอด 50 — เว้นแต่ใต้บรรทัดมียอดหรือ ຫລັກ รออยู่", () => {
    const brief = (text: string) => parseTicket(text).bets.map((b) => `${b.number} ${b.position} ${b.amount}`);
    expect(brief("96/50")).toEqual(["96 TOP 50000"]);
    expect(brief("19 59 99/50")).toEqual(["19 TOP 50000", "59 TOP 50000", "99 TOP 50000"]);
    const two = parseTicket("39 79 19 59 99/11บล\n119 159 199 939 979/5");
    expect(two.issues).toEqual([]);
    expect(two.bets.filter((b) => b.amount === 11000)).toHaveLength(10);
    expect(two.bets.filter((b) => b.amount === 5000).map((b) => b.number)).toEqual(["119", "159", "199", "939", "979"]);
    expect(brief("18.58/10ບລ")).toEqual(["18 TOP 10000", "18 BOTTOM 10000", "58 TOP 10000", "58 BOTTOM 10000"]);
    expect(brief("96/50\n32/10ບລ")).toEqual(["96 TOP 50000", "32 TOP 10000", "32 BOTTOM 10000"]);
    expect(brief("96/50\nໂຕ5")).toEqual(["96 TOP 5000", "50 TOP 5000"]);
    expect(brief("22/62\nລັກ8=5")).toEqual(["822 TOP 5000", "862 TOP 5000"]);
  });

  test("บรรทัดเลขล้วนเว้นวรรคเหนือ ຫລັກ = เลขฐาน ไม่ใช่ เลข=ยอด", () => {
    const brief = (text: string) => parseTicket(text).bets.map((b) => `${b.number} ${b.position} ${b.amount}`);
    expect(brief("04 44\nລັກ2\nໂຕ20")).toEqual(["204 TOP 20000", "244 TOP 20000"]);
    expect(parseTicket("32 72 11\nຫຼັກ 1 .3 .5ໂຕ500฿").bets.map((b) => b.number)).toEqual([
      "132", "172", "111", "332", "372", "311", "532", "572", "511",
    ]);
  });

  test("24;64;28=100*50 — มี = ตัวเดียว ; หน้า = คั่นระหว่างเลข", () => {
    const ticket = parseTicket("24;64;28;68;25;65;26;66;36;76;34;74=100*50\nລວມ1.800");
    expect(ticket.issues).toEqual([]);
    expect(ticket.bets).toHaveLength(24);
    expect(ticket.bets.slice(0, 2).map((b) => `${b.number} ${b.position} ${b.amount}`)).toEqual(
      ["24 TOP 100000", "24 BOTTOM 50000"],
    );
    expect(ticket.declaredTotal).toBe(1800);
    expect(ticket.typedTotal).toBe(1800);
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

  test("ตัวละ20฿บนล่าง ใต้เลขปน 2/3 ตัว → เลข 3 ตัวบนอย่างเดียว · เลข 2 ตัวบนล่าง", () => {
    const ticket = parseTicket("952\n208\n876\n76\n02\n67\n\nตัวละ20฿บนล่าง");
    expect(ticket.issues).toEqual([]);
    expect(ticket.bets.map((b) => `${b.number} ${b.position} ${b.currency} ${b.amount}`)).toEqual([
      "952 TOP THB 20", "208 TOP THB 20", "876 TOP THB 20",
      "76 TOP THB 20", "76 BOTTOM THB 20", "02 TOP THB 20", "02 BOTTOM THB 20", "67 TOP THB 20", "67 BOTTOM THB 20",
    ]);
    expect(parseTicket("952\n76\n\nໂຕລະ20฿ບົນລ່າງ").issues).toEqual([]);
    // เลข 3 ตัวล้วน + บนล่าง → ลงบน 20 ตามปกติ
    const three = parseTicket("952\n208\nตัวละ20บนล่าง", { lakMultiplier: 1 });
    expect(three.issues).toEqual([]);
    expect(three.bets.map((b) => `${b.number} ${b.position} ${b.amount}`)).toEqual(["952 TOP 20", "208 TOP 20"]);
  });

  test("255=ໂຕ5ພັນ — ໂຕ หลัง = · เลขด้านบนที่ไม่มียอดได้ยอดของบรรทัดล่าง แยกเป็นชุด ๆ", () => {
    const ticket = parseTicket("237\n247\n257\n255=ໂຕ5ພັນ\n115\n155\n195\n124\n164\n15\n55\n95\n24\n64=ໂຕ2ພັນ");
    expect(ticket.issues).toEqual([]);
    expect(ticket.bets.map((b) => `${b.number} ${b.amount}`)).toEqual([
      "237 5000", "247 5000", "257 5000", "255 5000",
      "115 2000", "155 2000", "195 2000", "124 2000", "164 2000", "15 2000", "55 2000", "95 2000", "24 2000", "64 2000",
    ]);
    expect(ticket.typedTotal).toBe(4 * 5 + 10 * 2);
    expect(parseTicket("33=ຮູລະ10ບລ").bets).toHaveLength(2);
  });

  test("ລວມ80฿ และไม่มีคำบอกกีบในโพย → รายการที่ไม่ได้ระบุสกุลเงินเป็นบาท", () => {
    const ticket = parseTicket("760=10\n60=20*10\n06=20*10\nລວມ70฿");
    expect(ticket.issues).toEqual([]);
    expect(ticket.bets.every((b) => b.currency === "THB")).toBe(true);
    expect(ticket.bets.map((b) => b.amount)).toEqual([10, 20, 10, 20, 10]);
    // มีคำบอกกีบในโพย → ไม่เปลี่ยน
    expect(parseTicket("760=10₭\nລວມ10฿").bets[0].currency).toBe("LAK");
  });

  test("ยอดรวมที่บอกฝั่ง (30.000 ເລກລ່າງ) = รายการด้านบนที่ไม่ได้ระบุฝั่งลงฝั่งนั้น", () => {
    const ticket = parseTicket("84=20\n44=5\n04=5\n__\n30.000 ເລກລ່າງ");
    expect(ticket.issues).toEqual([]);
    expect(ticket.bets.map((b) => `${b.number} ${b.position} ${b.amount}`)).toEqual(
      ["84 BOTTOM 20000", "44 BOTTOM 5000", "04 BOTTOM 5000"],
    );
    expect(ticket.declaredTotal).toBe(30);
    expect(ticket.typedTotal).toBe(30);

    const sides = (text: string) => parseTicket(text).bets.map((b) => `${b.number} ${b.position}`);
    expect(sides("84=20\n44=5\nລວມ25 ເລກລ່າງ")).toEqual(["84 BOTTOM", "44 BOTTOM"]);
    expect(sides("84=20\n44=5\nรวม 25 เลขล่าง")).toEqual(["84 BOTTOM", "44 BOTTOM"]);
    // ไม่บอกฝั่ง → บนตามเดิม · เลข 3 ตัวลงล่างไม่ได้ → รอตรวจ
    expect(sides("84=20\n44=5\n25.000")).toEqual(["84 TOP", "44 TOP"]);
    expect(parseTicket("84=20\n144=5\n25.000 ເລກລ່າງ").issues.map((i) => i.code)).toEqual(["THREE_DIGIT_BOTTOM"]);
  });

  test("14.000ບົນ / ລ 14.000ບົນ / ລວມ 14.000ບົນ / 14.000 = ยอดรวม (ลาว + ไทย)", () => {
    const body = "2/10/26🇱🇦\n28=5\n68=5\n028=2\n068=2\n";
    for (const tail of ["14.000ບົນ", "ລວມ 14.000ບົນ", "ລ 14.000ບົນ", "14.000", "14,000", "รวม 14.000บน", "ล 14.000บน", "ล14"]) {
      const ticket = parseTicket(body + tail);
      expect(ticket.issues).toEqual([]);
      expect(ticket.notes).toEqual(["2/10/26🇱🇦"]);
      expect(ticket.declaredTotal).toBe(14);
      expect(ticket.typedTotal).toBe(14);
    }
    // ยอดเงินกีบไม่มีหลักร้อย → เลข 3 ตัวสองตัวที่ดูเหมือนหลักพัน (506.546 / 500.600) ไม่ใช่ยอดรวม
    expect(parseTicket("506.546\n586=1").declaredTotal).toBeNull();
    const pair = parseTicket("500.600\n700=1", { lakMultiplier: 1 });
    expect(pair.declaredTotal).toBeNull();
    expect(pair.bets.map((b) => `${b.number} ${b.amount}`)).toEqual(["500 1", "600 1", "700 1"]);
    // 500.000 = ยอดรวม · ยอดแบบย่อที่มีหลักร้อยต้องมี ລວມ นำหน้า
    expect(parseTicket("32=250\n72=250\n500.000").declaredTotal).toBe(500);
    expect(parseTicket("32=1000*800\nລວມ1.800").declaredTotal).toBe(1800);
  });

  test("ລ120 (ລ หน้ายอดเปล่า ๆ) = ยอดรวม ไม่ใช่ล่าง", () => {
    const ticket = parseTicket("32=50\n72=50\n372=10\n332=10\nລ120", { lakMultiplier: 1 });
    expect(ticket.issues).toEqual([]);
    expect(ticket.bets.every((b) => b.position === "TOP")).toBe(true);
    expect(ticket.declaredTotal).toBe(120);
    expect(ticket.typedTotal).toBe(120);
    // ລ หลังยอด / บรรทัด ລ เปล่า ๆ ยังเป็นล่าง
    expect(parseTicket("30=100ລ").bets.map((b) => b.position)).toEqual(["BOTTOM"]);
    expect(parseTicket("32 72=10\nລ").bets.map((b) => b.position)).toEqual(["BOTTOM", "BOTTOM"]);
  });

  test("=15/ລາວ = ยอดรวมหวยลาว 15 · เลขที่ไม่มียอดได้ยอดของบรรทัดล่าง", () => {
    const ticket = parseTicket("06 =5\n46\n86 =5\n=15/ລາວ", { lakMultiplier: 1 });
    expect(ticket.issues).toEqual([]);
    expect(ticket.bets.map((b) => `${b.number} ${b.amount}`)).toEqual(["06 5", "46 5", "86 5"]);
    expect(ticket.declaredTotal).toBe(15);
    expect(ticket.typedTotal).toBe(15);
    expect(parseTicket("32=15\n=15 ລາວ", { lakMultiplier: 1 }).declaredTotal).toBe(15);
  });

  test("ยอดรวม 1,000–9,999 กำกวม → เลือกแบบที่ตรงกับยอดที่คิดได้ (9.000 กีบเต็ม หรือ 1.800 แบบย่อ)", () => {
    for (const text of ["06=3\n46=3\n86=3\n___\n9.000", "06=3\n46=3\n86=3\nລວມ9.000"]) {
      const ticket = parseTicket(text);
      expect(ticket.issues).toEqual([]);
      expect(ticket.declaredTotal).toBe(9);
      expect(ticket.typedTotal).toBe(9);
    }
    expect(parseTicket("24;64;28;68;25;65;26;66;36;76;34;74=100*50\nລວມ1.800").issues).toEqual([]);
    // ไม่ตรงทั้งสองแบบ → ยังเตือน
    expect(parseTicket("06=3\n46=3\n86=3\nລວມ8.000").issues.map((i) => i.code)).toEqual(["TOTAL_MISMATCH"]);
  });

  test("ตัวเลขเปล่า ๆ ใต้เส้นคั่น (_____ / -----) = ยอดรวม", () => {
    const ticket = parseTicket(
      "21=7*2\n61=7*2\n22=7*2\n62=7*2\n24=9*2\n64=9*2\n124=2\n164=2\n924=2\n964=2\n12=5*2\n52=5*2\n92=5*2\n25=5*2\n65=5*2\n_____\n101.000",
    );
    expect(ticket.issues).toEqual([]);
    expect(ticket.notes).toEqual(["_____"]);
    expect(ticket.bets).toHaveLength(26);
    expect(ticket.declaredTotal).toBe(101);
    expect(ticket.typedTotal).toBe(101);

    expect(parseTicket("32=50\n72=50\n-----\n100").declaredTotal).toBe(100);
    // ไม่มีเส้นคั่นแต่เป็นรูปแบบหลักพันเดี่ยว ๆ → ยอดรวมเหมือนกัน · ใต้เส้นเป็นเลขหลายตัว → ไม่ใช่ยอดรวม
    expect(parseTicket("32=50\n101.000").declaredTotal).toBe(101);
    expect(parseTicket("32=50\n_____\n32 72").declaredTotal).toBeNull();
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

  test("ໃສ່ຫລັກ5ໂຕ10 = ຫລັກ5ໂຕ10 (เลข 2 ตัวด้านบน + เลข 3 ตัวหลักร้อย 5)", () => {
    const expected = [
      "08 10", "48 10", "88 10", "15 10", "55 10", "95 10",
      "508 10", "548 10", "588 10", "515 10", "555 10", "595 10",
    ];
    for (const text of ["08,48,88,15,55,95:10\nໃສ່ຫລັກ5ໂຕ10", "08,48,88,15,55,95:10 ໃສ່ຫລັກ5ໂຕ10", "08,48,88,15,55,95:10\nใส่หลัก5ตัว10"]) {
      const ticket = parseTicket(text, { lakMultiplier: 1 });
      expect(ticket.issues).toEqual([]);
      expect(ticket.bets.map((b) => `${b.number} ${b.amount}`)).toEqual(expected);
    }
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

  test("ยอดเขียนเป็นคำ + ພັນ / พัน (ໂຕສອງພັນ = เลขละ 2,000)", () => {
    const ticket = parseTicket("39.79.09.49.89.01.41.81.05.45.85 12.52.92ໂຕສອງພັນ");
    expect(ticket.issues).toEqual([]);
    expect(ticket.bets).toHaveLength(14);
    expect(ticket.bets.every((b) => b.position === "TOP" && b.amount === 2000)).toBe(true);

    const amount = (text: string) => parseTicket(text).bets.map((b) => b.amount);
    expect(amount("32=ສິບຫ້າພັນ")).toEqual([15000]);
    expect(amount("32 ໂຕຊາວພັນບລ")).toEqual([20000, 20000]);
    expect(amount("32=ຊາວເອັດພັນ")).toEqual([21000]);
    expect(amount("32=ห้าพัน")).toEqual([5000]);
    expect(amount("32=สามสิบพัน")).toEqual([30000]);
    // ไม่มี ພັນ ตามหลัง และไม่อยู่หลัง ໂຕ / = → ไม่แปลง (ชื่อคน)
    expect(parseTicket("ແມ່ສອງ\n32=5").notes).toEqual(["ແມ່ສອງ"]);
  });

  test("คำทักทาย/ซื้อเลขหน้าเลข · ยอดเป็นคำหลัง ໂຕລະ (ສບດຊື້ເລກ807;07:ໂຕລະຫ້າສີບ)", () => {
    const ticket = parseTicket("ສບດຊື້ເລກ807;07:ໂຕລະຫ້າສີບ");
    expect(ticket.issues).toEqual([]);
    expect(ticket.bets.map((b) => `${b.number} ${b.position} ${b.amount}`)).toEqual(["807 TOP 50000", "07 TOP 50000"]);

    const amount = (text: string) => parseTicket(text).bets.map((b) => `${b.number} ${b.position} ${b.amount}`);
    expect(amount("ซื้อเลข 32=ห้าสิบ")).toEqual(["32 TOP 50000"]);
    expect(amount("ເລກ 32 72 ໂຕລະສິບບລ")).toEqual(["32 TOP 10000", "32 BOTTOM 10000", "72 TOP 10000", "72 BOTTOM 10000"]);
  });

  test("บรรทัดลงท้ายด้วยขีด = เขียนต่อบรรทัดล่าง · หัวโพยมีคำ + วันที่ปี 2 หลักเป็นหมายเหตุ", () => {
    const text = (total: number) =>
      `ຊື້ເລກລາວມື້ນີ້ແດ່02/10/26\n02-04-06-08-20-22-\n24-26-40-42-46-48-\n62-64-66-68-80-82-\n84-86-90-92-94-96-\n98-30-32-34-36-38-\n70-72-74-76-78= 8\nລວມ = ${total}`;
    const ticket = parseTicket(text(280), { lakMultiplier: 1 });
    expect(ticket.issues).toEqual([]);
    expect(ticket.notes).toEqual(["ຊື້ເລກລາວມື້ນີ້ແດ່02/10/26"]);
    expect(ticket.bets).toHaveLength(35);
    expect(ticket.bets.every((b) => b.amount === 8 && b.position === "TOP")).toBe(true);
    expect(ticket.bets[0]).toMatchObject({ number: "02", line: 2 });
    expect(ticket.typedTotal).toBe(280);
    // 35 เลข × 8 = 280 — ลูกค้าแจ้ง 288 ยังเตือนยอดไม่ตรง
    expect(parseTicket(text(288), { lakMultiplier: 1 }).issues.map((i) => i.code)).toEqual(["TOTAL_MISMATCH"]);
  });

  test("สกุลเงินต่อท้ายทั้งยอดบนและล่าง (20ບາດ×20ບາດ)", () => {
    const brief = (text: string) => parseTicket(text).bets.map((b) => `${b.number} ${b.position} ${b.currency} ${b.amount}`);
    expect(brief("11.77.99=20ບາດ×20ບາດ")).toEqual([
      "11 TOP THB 20", "11 BOTTOM THB 20", "77 TOP THB 20", "77 BOTTOM THB 20", "99 TOP THB 20", "99 BOTTOM THB 20",
    ]);
    expect(brief("32=20ບາດ×10")).toEqual(["32 TOP THB 20", "32 BOTTOM THB 10"]);
    expect(brief("32=20ພັນ*10ພັນ")).toEqual(["32 TOP LAK 20000", "32 BOTTOM LAK 10000"]);
    expect(parseTicket("11.77.99=20ບາດ×20ບາດ").issues).toEqual([]);
  });

  test("วงเล็บคั่นระหว่างเลข (826)866=10)", () => {
    const brief = (text: string) => parseTicket(text, { lakMultiplier: 1 }).bets.map((b) => `${b.number} ${b.amount}`);
    expect(brief("826)866=10")).toEqual(["826 10", "866 10"]);
    expect(brief("(826)(866)=10")).toEqual(["826 10", "866 10"]);
    expect(parseTicket("826)866=10").issues).toEqual([]);
  });

  test("(ບລ) ในวงเล็บ = บนล่าง", () => {
    const brief = (text: string) =>
      parseNative(text, { lakMultiplier: 1 }).bets.map((b) => `${b.number} ${b.position}`);
    const both = ["32 TOP", "32 BOTTOM", "72 TOP", "72 BOTTOM"];
    expect(brief("32 72=10 (ບລ)")).toEqual(both);
    expect(brief("32 72 ໂຕ10(ບລ)")).toEqual(both);
    expect(brief("32=10\n72=10\n(ບລ)")).toEqual(both);
    expect(brief("(ບລ) ຮູ10\n32 72")).toEqual(both);
    expect(brief("32=10[ລ່າງ]")).toEqual(["32 BOTTOM"]);
    expect(parseNative("32=10(ບລ)").issues).toEqual([]);
  });

  test("ລ່າງບົນ / ล่างบน (สลับลำดับ) = บนล่าง", () => {
    const brief = (text: string) => parseTicket(text).bets.map((b) => `${b.number} ${b.position} ${b.amount}`);
    expect(brief("32-72=3ພັນລ່າງບົນລາວ")).toEqual(["32 TOP 3000", "32 BOTTOM 3000", "72 TOP 3000", "72 BOTTOM 3000"]);
    expect(brief("32=3ล่างบน")).toEqual(["32 TOP 3000", "32 BOTTOM 3000"]);
    const ticket = parseTicket("17-57-97-30-70-08-48-88-07-47-87-30-78-38=3ພັນລ່າງບົນລາວ");
    expect(ticket.issues).toEqual([]);
    expect(ticket.bets).toHaveLength(28);
  });

  test("30ບົນ/20ລ່າງ = บน × ล่าง · ລບ = บนล่าง · ชื่อติดยอด (5ຂົນ)", () => {
    const brief = (text: string) =>
      parseTicket(text, { lakMultiplier: 1 }).bets.map((b) => `${b.number} ${b.position} ${b.amount}`);
    expect(brief("52.53=30ບົນ/20ລ່າງ\nລາວ")).toEqual(["52 TOP 30", "52 BOTTOM 20", "53 TOP 30", "53 BOTTOM 20"]);
    expect(brief("32=20ລ່າງ 30ບົນ")).toEqual(["32 TOP 30", "32 BOTTOM 20"]);
    expect(brief("20 23=5ລບ")).toEqual(["20 TOP 5", "20 BOTTOM 5", "23 TOP 5", "23 BOTTOM 5"]);
    expect(brief("03,43,83,30,70 ,00,20,60=5ຂົນ")).toEqual(
      ["03", "43", "83", "30", "70", "00", "20", "60"].map((n) => `${n} TOP 5`),
    );
    expect(brief("24 64=5ແມ່")).toEqual(["24 TOP 5", "64 TOP 5"]);
    // ฝั่งซ้ำ / คำกำกับพิมพ์ผิด (มี ບ ລ) / อักษรอังกฤษติดยอด → ยังรอตรวจ
    for (const text of ["32=30ບົນ/20ບົນ", "32=5ບນ", "32=5abc"]) {
      expect([text, parseTicket(text).issues.map((i) => i.code)]).toEqual([text, ["UNREADABLE"]]);
    }
  });

  test("ชื่อติดยอดหลัง ໂຕ (ໂຕ200แสม) · 2ແສນ = 200,000 · หน่วยเงินไม่ถูกตัดเป็นชื่อ", () => {
    const brief = (text: string) => parseTicket(text).bets.map((b) => `${b.number} ${b.position} ${b.amount}`);
    expect(brief("16.56.96โต200แสม")).toEqual(["16 TOP 200000", "56 TOP 200000", "96 TOP 200000"]);
    expect(brief("32=2ແສນ")).toEqual(["32 TOP 200000"]);
    expect(brief("32=2 แสนบล")).toEqual(["32 TOP 200000", "32 BOTTOM 200000"]);
    // 200ແສນ (= 20 ล้าน?) / ລ້ານ → รอตรวจ ไม่ตัดหน่วยทิ้งเป็นชื่อ
    for (const text of ["16.56.96โต200แสน", "32=1ລ້ານ"]) {
      expect([text, parseTicket(text).issues.map((i) => i.code)]).toEqual([text, ["UNREADABLE"]]);
    }
  });

  test("ບ ตัวเดียว = ບົນ · บ ไทยตัวเดียวยังกำกวม", () => {
    const brief = (text: string) => parseTicket(text).bets.map((b) => `${b.number} ${b.position} ${b.currency} ${b.amount}`);
    expect(brief("35-75-34-74=5 ບ")).toEqual(["35", "75", "34", "74"].map((n) => `${n} TOP LAK 5000`));
    expect(brief("32=5ບ")).toEqual(["32 TOP LAK 5000"]);
    expect(brief("32=5ບາດ")).toEqual(["32 TOP THB 5"]);
    expect(brief("32=5ບລ")).toEqual(["32 TOP LAK 5000", "32 BOTTOM LAK 5000"]);
    for (const text of ["32=5ບນ", "32=5บ"]) {
      expect([text, parseTicket(text).issues.map((i) => i.code)]).toEqual([text, ["UNREADABLE"]]);
    }
  });

  test("ປ່ອງລະພັນ / ໂຕລະພັນ (ไม่มีตัวเลข) = เลขละ 1 พัน", () => {
    const brief = (text: string) => parseTicket(text).bets.map((b) => `${b.number} ${b.position} ${b.amount}`);
    expect(brief("204\n845\n450\nປ່ອງລະພັນ")).toEqual(["204 TOP 1000", "845 TOP 1000", "450 TOP 1000"]);
    expect(brief("204 845 ໂຕລະພັນ")).toEqual(["204 TOP 1000", "845 TOP 1000"]);
    expect(brief("32\nตัวละพัน")).toEqual(["32 TOP 1000"]);
    expect(brief("32=ໂຕສອງພັນ")).toEqual(["32 TOP 2000"]);
  });

  test("' ’ ระหว่างเลข = ตัวคั่นเลข (19'59'99…โต20พัน)", () => {
    const ticket = parseTicket("19'59'99'17'57'97'06'46'86'38'78'05'45'85โต20พัน");
    expect(ticket.issues).toEqual([]);
    expect(ticket.bets).toHaveLength(14);
    expect(ticket.bets.every((b) => b.position === "TOP" && b.amount === 20000)).toBe(true);
    expect(parseTicket("19’59’99=5").bets.map((b) => b.number)).toEqual(["19", "59", "99"]);
  });

  test("ตัวท้ายที่ลงท้ายด้วยคำบอกบาท = ยอด (19-99-200Bเลขบนลาว)", () => {
    const brief = (text: string) => parseTicket(text).bets.map((b) => `${b.number} ${b.position} ${b.currency} ${b.amount}`);
    expect(brief("19-99-200Bเลขบนลาว")).toEqual(["19 TOP THB 200", "99 TOP THB 200"]);
    expect(brief("19-99-200฿")).toEqual(["19 TOP THB 200", "99 TOP THB 200"]);
  });

  test("ชื่อ + : นำหน้ายอดรวม (Jo: 70.000k)", () => {
    const ticket = parseTicket("32. 72= 25.000\n\n432. 472=10.000\nJo: 70.000k");
    expect(ticket.issues).toEqual([]);
    expect(ticket.declaredTotal).toBe(70);
    expect(parseTicket("32=5\nJo: 80.000").issues.map((i) => i.code)).toEqual(["TOTAL_MISMATCH"]);
    // ໂຕ: = ยอดเลขละ ไม่ใช่ชื่อ
    const each = parseTicket("24 64\nໂຕ:10.000");
    expect(each.declaredTotal).toBeNull();
    expect(each.bets.map((b) => `${b.number} ${b.amount}`)).toEqual(["24 10000", "64 10000"]);
  });

  test("ลวม (ລວມ พิมพ์ด้วยตัวอักษรไทย) = ยอดรวม", () => {
    const ticket = parseTicket("11.51.91.12.52.92.77.37=3\n32.72.28.68=3\nบน 🇱🇦\nลวม36.000");
    expect(ticket.issues).toEqual([]);
    expect(ticket.declaredTotal).toBe(36);
    expect(ticket.bets).toHaveLength(12);
    expect(ticket.bets.every((b) => b.position === "TOP" && b.amount === 3000)).toBe(true);
    expect(parseTicket("32=3\nลวม5.000").issues.map((i) => i.code)).toEqual(["TOTAL_MISMATCH"]);
  });

  test("ยอดรวมท้ายบรรทัดรายการ (24.64=5x10.     ລາວ/90) แยกเป็นยอดรวม", () => {
    const ticket = parseTicket("39.79.979=20\n24.64=5x10.     ລາວ/90");
    expect(ticket.issues).toEqual([]);
    expect(ticket.declaredTotal).toBe(90);
    expect(ticket.bets.map((b) => `${b.number} ${b.position} ${b.amount}`)).toEqual([
      "39 TOP 20000", "79 TOP 20000", "979 TOP 20000",
      "24 TOP 5000", "24 BOTTOM 10000", "64 TOP 5000", "64 BOTTOM 10000",
    ]);
    expect(parseTicket("32=10 ລວມ20").issues.map((i) => i.code)).toEqual(["TOTAL_MISMATCH"]);
    // ລາວ ท้ายยอดที่ไม่มีเลขตาม = คำกำกับ ไม่ใช่ยอดรวม
    expect(parseTicket("32=10 ລາວ").declaredTotal).toBeNull();
  });

  test("ประโยคนำที่ลงท้ายด้วย ຊື້ / ເລກ หน้าเลขแรก ไม่มีผล", () => {
    const brief = (text: string) => parseTicket(text).bets.map((b) => `${b.number} ${b.position} ${b.amount}`);
    expect(brief("ເຮົາຢາກຊື້ເລກ 14 54 94 ໂຕ 10ພັນ")).toEqual(["14 TOP 10000", "54 TOP 10000", "94 TOP 10000"]);
    expect(brief("อยากซื้อ 32=5")).toEqual(["32 TOP 5000"]);
  });

  test("b = บาท (01=200*100b) — ไม่ต้องมีเงื่อนไขอ่านโพย", () => {
    const text = "01=200*100b\n41=200*100b\n81=200*100b\n101=100b\n141=100b\n181=100b";
    const expected = [
      "01 TOP THB 200", "01 BOTTOM THB 100", "41 TOP THB 200", "41 BOTTOM THB 100",
      "81 TOP THB 200", "81 BOTTOM THB 100", "101 TOP THB 100", "141 TOP THB 100", "181 TOP THB 100",
    ];
    const brief = (ticket: ReturnType<typeof parseTicket>) =>
      ticket.bets.map((b) => `${b.number} ${b.position} ${b.currency} ${b.amount}`);
    // ไม่มีเงื่อนไข / มีเงื่อนไข {N}={A}b ของแม่หวย (ใช้ไม่ได้กับ บน*ล่าง) → ผลเหมือนกัน
    for (const rules of [[], [{ kind: "PATTERN" as const, find: "{N}={A}b", replace: "{N}={A}บาท" }]]) {
      const ticket = parseTicket(text, { rules });
      expect(ticket.issues).toEqual([]);
      expect(brief(ticket)).toEqual(expected);
    }
    expect(brief(parseTicket("32=100baht"))).toEqual(["32 TOP THB 100"]);
    expect(brief(parseTicket("32 72 5b"))).toEqual(["32 TOP THB 5", "72 TOP THB 5"]);
  });

  test("k = พัน (ໂຕ5kບລ = บนล่าง เลขละ 5,000)", () => {
    const ticket = parseTicket("14/54/94/18/58/98\n11/51/91/12/52/92\nໂຕ5kບລ");
    expect(ticket.issues).toEqual([]);
    expect(ticket.bets).toHaveLength(24);
    expect(ticket.bets.every((b) => b.amount === 5000 && b.currency === "LAK")).toBe(true);
    expect(ticket.bets.slice(0, 2).map((b) => `${b.number} ${b.position} @${b.line}`)).toEqual(["14 TOP @1", "14 BOTTOM @1"]);

    const brief = (text: string) => parseTicket(text).bets.map((b) => `${b.number} ${b.currency} ${b.amount}`);
    expect(brief("32=5k")).toEqual(["32 LAK 5000"]);
    expect(brief("32=5kip")).toEqual(["32 LAK 5000"]);
    expect(brief("32 72 5K")).toEqual(["32 LAK 5000", "72 LAK 5000"]);
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
    // ไม่มีคำบอกหลักพัน แต่ตัวท้ายเป็นเลขหลักเดียว → ยอด · เลข 2 หลักไม่มีคำบอกหลักพัน → ไม่เดา
    expect(parseTicket("32_72_29_69_5").issues).toEqual([]);
    expect(parseTicket("32_72_29_69_50").issues.map((i) => i.code)).toEqual(["NO_AMOUNT"]);
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

  test("ລ່າງ เว้นบรรทัดจากด้านบน = หัวฝั่งของรายการด้านล่าง", () => {
    const ticket = parseTicket("39=10\n79=10\n639=5\n679=5\n\n\nລ່າງ\n32=5\n72=5\n39=5\n79=5", { lakMultiplier: 1 });
    expect(ticket.issues).toEqual([]);
    expect(ticket.notes).toEqual(["ລ່າງ"]);
    expect(ticket.bets.map((b) => `${b.number} ${b.position} ${b.amount}`)).toEqual([
      "39 TOP 10", "79 TOP 10", "639 TOP 5", "679 TOP 5",
      "32 BOTTOM 5", "72 BOTTOM 5", "39 BOTTOM 5", "79 BOTTOM 5",
    ]);
    // บรรทัดแรกเป็นหัวฝั่ง · บรรทัดที่ระบุฝั่งเองใช้ฝั่งของตัวเอง
    const brief = (text: string) => parseTicket(text).bets.map((b) => `${b.number} ${b.position}`);
    expect(brief("ລ່າງ\n32=5\n33=5ບົນ")).toEqual(["32 BOTTOM", "33 TOP"]);
    // ติดใต้รายการ (ไม่เว้นบรรทัด) → ยังเปลี่ยนฝั่งของด้านบนเหมือนเดิม
    expect(brief("22_10\n62_10\nລ່າງ")).toEqual(["22 BOTTOM", "62 BOTTOM"]);
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
    const codes = (text: string) => parseNative(text).issues.map((i) => i.code);
    expect(codes("788-778-678")).toEqual(["NO_AMOUNT"]);
    expect(codes("32=")).toEqual(["NO_AMOUNT"]);
    expect(codes("32=100บ")).toEqual(["UNREADABLE"]); // บ ไทยตัวเดียว: บน หรือ บาท (ບ ลาวตัวเดียว = ບົນ)
    expect(codes("32=100*100ລ່າງ")).toEqual(["UNREADABLE"]);
    expect(codes("32=100=200")).toEqual(["UNREADABLE"]);
    expect(codes("32=0")).toEqual(["UNREADABLE"]);
    expect(codes("35 50")).toEqual(["NO_AMOUNT"]); // 50 อาจเป็นเลข
  });

  test("ธง / อีโมจิ (🇱🇦 💰 ✅ ❤️) ในบรรทัดรายการถูกตัดทิ้ง · บรรทัดที่มีแต่อีโมจิเป็นหมายเหตุ", () => {
    const brief = (text: string) => parseTicket(text).bets.map((b) => `${b.number} ${b.position}`);
    expect(brief("32=10🇱🇦")).toEqual(["32 TOP"]);
    expect(brief("🇱🇦32=10")).toEqual(["32 TOP"]);
    expect(brief("🇱🇦 32 72=10ບລ 🇹🇭")).toEqual(["32 TOP", "32 BOTTOM", "72 TOP", "72 BOTTOM"]);
    expect(brief("32=10💰✅")).toEqual(["32 TOP"]);
    expect(brief("32=10❤️")).toEqual(["32 TOP"]);
    const flag = parseTicket("🇱🇦\n32=10\nລວມ10🇱🇦");
    expect(flag.issues).toEqual([]);
    expect(flag.notes).toEqual(["🇱🇦"]);
    expect(flag.declaredTotal).toBe(10);
  });

  test("ชื่อลูกค้าต่อท้ายยอด (052=100ກີບ ອ້າຍຊານ) ไม่นับ", () => {
    const brief = (text: string) =>
      parseTicket(text).bets.map((b) => `${b.number} ${b.position} ${b.currency} ${b.amount}`);
    expect(brief("052=100ກີບ ອ້າຍຊານ")).toEqual(["052 TOP LAK 100000"]);
    expect(brief("32=100 ອ້າຍ ຊານ")).toEqual(["32 TOP LAK 100000"]);
    expect(brief("32 72=10ບລ ແມ່ຕ້ອຍ")).toEqual(
      ["32 TOP LAK 10000", "32 BOTTOM LAK 10000", "72 TOP LAK 10000", "72 BOTTOM LAK 10000"],
    );
    // ບ ตัวเดียว = ບົນ ทั้งติดยอดและแยกเป็นคำ — ชื่อต่อท้ายยังตัดได้
    expect(brief("32=100ບ ອ້າຍ")).toEqual(["32 TOP LAK 100000"]);
    expect(brief("32=100 ບ")).toEqual(["32 TOP LAK 100000"]);
    // บ ไทยตัวเดียว (บน หรือ บาท) → ยังรอตรวจ ไม่ตัดเป็นชื่อ
    expect(parseTicket("32=100บ ອ້າຍ").issues.map((i) => i.code)).toEqual(["UNREADABLE"]);
  });

  test("บรรทัดวันที่ / ชื่อ + เบอร์โทร เก็บเป็นหมายเหตุ ไม่นับเป็นปัญหา", () => {
    const ticket = parseNative("03/10/2026🇱🇦\n05 45 85=50฿\n02 42 82=50฿\n20 00 60=50฿\nລວມ450฿");
    expect(ticket.issues).toEqual([]);
    expect(ticket.notes).toEqual(["03/10/2026🇱🇦"]);
    expect(ticket.bets).toHaveLength(9);
    expect(ticket.declaredTotal).toBe(450);
    expect(ticket.typedTotal).toBe(450);

    for (const line of ["3/10/26", "03-10-2026 ນາງ ແອ໋ມ", "2026-10-03", "3.10.2026", "ແມ່ຕ້ອຍ 02055551234", "020 555 1234"]) {
      const parsed = parseNative(`${line}\n32=10`);
      expect(parsed.issues).toEqual([]);
      expect(parsed.notes).toEqual([line]);
    }
    // อาจเป็นเลขแทง → ไม่ถือเป็นวันที่
    expect(parseNative("30.10.26").issues.map((i) => i.code)).toEqual(["NO_AMOUNT"]);
    expect(parseNative("30/10/26=10").bets).toHaveLength(3);
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
  });

  test("605-645-685 / 724-764 ไม่มียอด → ได้ยอดของบรรทัดล่าง (ทุกรูปแบบของบรรทัดยอด)", () => {
    const brief = (text: string) => parseTicket(text, { lakMultiplier: 1 }).bets.map((b) => `${b.number} ${b.amount}`);
    const top = ["605 5", "645 5", "685 5", "724 5", "764 5"];
    expect(brief("605-645-685\n724-764=5")).toEqual(top);
    expect(brief("605-645-685\n724-764\nໂຕ5")).toEqual(top);
    expect(brief("605-645-685\n724-764\n26-66=5")).toEqual([...top, "26 5", "66 5"]);
    // ไม่มียอดด้านล่างเลย → รอตรวจ
    expect(parseTicket("605-645-685\n724-764").issues.map((i) => i.code)).toEqual(["NO_AMOUNT", "NO_AMOUNT"]);
  });

  test("เลขคั่นด้วย . แล้วขีดตัวเดียว = หลังขีดเป็นยอด (08.48.88-20 · 22.62-10)", () => {
    const brief = (text: string) => parseTicket(text, { lakMultiplier: 1 }).bets.map((b) => `${b.number} ${b.amount} @${b.line}`);
    expect(brief("08.48.88-20")).toEqual(["08 20 @1", "48 20 @1", "88 20 @1"]);
    expect(brief("22.62-10")).toEqual(["22 10 @1", "62 10 @1"]);
    expect(brief("22.62-10\n11.51.91-5\n19.59.99-5")).toEqual([
      "22 10 @1", "62 10 @1", "11 5 @2", "51 5 @2", "91 5 @2", "19 5 @3", "59 5 @3", "99 5 @3",
    ]);
    expect(parseTicket("08.48.88-20").issues).toEqual([]);
  });

  test("โพยที่ใช้ขีดคั่นเลข →\"724-764\" เป็นเลข 2 ตัว ไม่ใช่เลข 724 ยอด 764", () => {
    const ticket = parseTicket(
      "406-446-486=1\n605-645-685\n724-764\n826-866\n310-350-390\n433-473\n619-659-699\n328-368\n931-971\n239-279\n729-769\n208-248-288=1",
    );
    expect(ticket.issues).toEqual([]);
    expect(ticket.bets).toHaveLength(29);
    expect(ticket.bets.every((b) => b.amount === 1000 && b.position === "TOP")).toBe(true);
    expect(ticket.bets.slice(6, 8).map((b) => `${b.number} @${b.line}`)).toEqual(["724 @3", "764 @3"]);
    expect(ticket.typedTotal).toBe(29);

    // โพยทั่วไป (ไม่มีบรรทัดขีดคั่นเลข 3 ตัว) → เลข-ยอด เหมือนเดิม
    const brief = (text: string) => parseTicket(text, { lakMultiplier: 1 }).bets.map((b) => `${b.number} ${b.amount}`);
    expect(brief("35-50")).toEqual(["35 50"]);
    expect(brief("762-5")).toEqual(["762 5"]);
    // โพยขีดคั่นเลข แต่ยอดหลังขีดเป็นเลขหลักเดียว → ยังเป็นยอด
    expect(brief("605-645-685=1\n762-5")).toEqual(["605 1", "645 1", "685 1", "762 5"]);
  });

  test("ໂຕ / ตัว = เลขละ", () => {
    expect(brief(parseTicket("33 73 073 ໂຕ 20").bets)).toEqual([
      "33 TOP LAK 20000",
      "73 TOP LAK 20000",
      "073 TOP LAK 20000",
    ]);
    expect(parseTicket("33 73 ตัว 20ล่าง").bets).toHaveLength(2);
  });

  test("ยอดแทงกีบคูณเฉพาะ 1–999 · ตั้งแต่ 1,000 (หรือ 1.000) พิมพ์เต็มจำนวนแล้ว ไม่คูณ", () => {
    expect(brief(parseTicket("32=10.000\n33=10,000\n34=9999\n35=999\n36=1000\n37=5.000").bets)).toEqual([
      "32 TOP LAK 10000",
      "33 TOP LAK 10000",
      "34 TOP LAK 9999",
      "35 TOP LAK 999000",
      "36 TOP LAK 1000",
      "37 TOP LAK 5000",
    ]);
    expect(brief(parseTicket("32=20,000฿").bets)).toEqual(["32 TOP THB 20000"]);
    // ยอดรวมเทียบในหน่วยย่อ: 20 + 30,000 = 50 = ລວມ50,000
    const ticket = parseTicket("32=20\n33=30,000\nລວມ50,000");
    expect(ticket.typedTotal).toBe(50);
    expect(ticket.declaredTotal).toBe(50);
    expect(ticket.needsReview).toBe(false);
  });

  test("ยอดเต็มจำนวน 5.000ກີບບົນ / 3.000ກີບລ່າງ / 1.000ກີບລາວ ไม่คูณ", () => {
    const ticket = parseTicket(
      "11 51 91 14 54 94 18 58 98 06 46 86 = 5.000ກີບບົນ\n\n11 51 91 14 54 94 18 58 98 06 46 86 = 3.000ກີບລ່າງ\n\n911 951 991 914 954 994 918 958 998 906 946 986 = 1.000ກີບລາວ",
    );
    expect(ticket.issues).toEqual([]);
    const line = (n: number) => ticket.bets.filter((b) => b.line === n);
    expect(line(1).every((b) => b.position === "TOP" && b.amount === 5000)).toBe(true);
    expect(line(3).every((b) => b.position === "BOTTOM" && b.amount === 3000)).toBe(true);
    expect(line(5).every((b) => b.position === "TOP" && b.amount === 1000)).toBe(true);
    expect([line(1).length, line(3).length, line(5).length]).toEqual([12, 12, 12]);
    // ยอดรวมแบบย่อยังเทียบได้: 12×5 + 12×3 + 12×1 = 108 (พัน)
    expect(ticket.typedTotal).toBe(108);
    // ยอดรวมแบบย่อเกิน 999 ยังคูณ (ລວມ1.800 = 1,800,000)
    expect(parseTicket("32=1000*800\nລວມ1.800").declaredTotal).toBe(1800);
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

describe("บรรทัด B เดี่ยว ๆ ด้านบน/ด้านล่าง = โพยบาท", () => {
  const brief2 = (text: string) => parseTicket(text).bets.map((b) => `${b.number} ${b.currency} ${b.amount}`);

  test("B ด้านบน / b ด้านล่าง / (B) / ฿ / B ใต้ยอดรวม → ทุกรายการที่ไม่ระบุสกุลเงินเป็นบาท ไม่คูณ", () => {
    for (const text of ["B\n32=100\n45=50", "32=100\n45=50\nb", "(B)\n32=100\n45=50", "฿\n32=100\n45=50", "32=100\n45=50\nລວມ150\nB"]) {
      expect(brief2(text)).toEqual(["32 THB 100", "45 THB 50"]);
    }
  });

  test("ລາວ/ເງິນບາດ฿ (หวยลาว จ่ายเงินบาท) = โพยบาท · ລາວ / ເງິນກີບ เดี่ยว ๆ ยังเป็นกีบ", () => {
    expect(brief2("55=10\n54=10\n45=10\nລາວ/ເງິນບາດ฿")).toEqual(["55 THB 10", "54 THB 10", "45 THB 10"]);
    expect(brief2("ເງິນບາດ\n32=100")).toEqual(["32 THB 100"]);
    expect(brief2("55=10\nລາວ")).toEqual(["55 LAK 10000"]);
    expect(brief2("55=10\nເງິນກີບ")).toEqual(["55 LAK 10000"]);
  });

  test("ชื่อลูกค้าก่อนบรรทัด B ยังนับเป็นด้านบน", () => {
    expect(brief2("ນ້ອຍ\nB\n32=100")).toEqual(["32 THB 100"]);
  });

  test("รายการที่เขียน ກີບ เองยังเป็นกีบ", () => {
    expect(brief2("B\n32=100\n45=50ກີບ")).toEqual(["32 THB 100", "45 LAK 50000"]);
  });

  test("B คั่นกลางระหว่างรายการ / คำที่ขึ้นต้นด้วย B → ไม่นับ ยังเป็นกีบ", () => {
    expect(brief2("32=100\nB\n45=50")).toEqual(["32 LAK 100000", "45 LAK 50000"]);
    expect(brief2("Bee\n32=100")).toEqual(["32 LAK 100000"]);
  });
});

describe("หลายเลขในแถวเดียว ยอดเดียว (10 20 30 50/5ບລ)", () => {
  const brief3 = (text: string) => parseTicket(text).bets.map((b) => `${b.number}${b.position[0]}${b.amount}`);
  const expected = ["10T5000", "10B5000", "20T5000", "20B5000", "30T5000", "30B5000", "50T5000", "50B5000"];

  test("แถวเดียวคั่นยอดด้วย / และแบบที่ AI กระจายเป็นบรรทัดละเลข → ได้รายการเดียวกัน", () => {
    expect(brief3("10 20 30 50/5ບລ")).toEqual(expected);
    expect(brief3("10=5ບລ\n20=5ບລ\n30=5ບລ\n50=5ບລ")).toEqual(expected);
  });

  test("เลข 3 ตัวในแถว ບລ → ลงบนอย่างเดียว ไม่มีล่าง", () => {
    expect(brief3("10 590 30/5ບລ")).toEqual(["10T5000", "10B5000", "30T5000", "30B5000", "590T5000"]);
    expect(brief3("590=5ບລ")).toEqual(["590T5000"]);
  });
});

describe("= คั่นระหว่างเลข (00=20=60=400=420=460=ໂຕ10ພ.ບ.ລ)", () => {
  const brief4 = (text: string) => parseTicket(text).bets.map((b) => `${b.number}${b.position[0]}${b.amount}`);

  test("= ทุกตัวยกเว้นตัวสุดท้ายคั่นเลข → อ่านเหมือนคั่นด้วยจุด", () => {
    const ticket = parseTicket("00=20=60=400=420=460=ໂຕ10ພ.ບ.ລ");
    expect(ticket.issues).toEqual([]);
    expect(brief4("00=20=60=400=420=460=ໂຕ10ພ.ບ.ລ")).toEqual(brief4("00.20.60.400.420.460=ໂຕ10ພ.ບ.ລ"));
    expect(brief4("00=20=ໂຕ10ບລ")).toEqual(["00T10000", "00B10000", "20T10000", "20B10000"]);
    expect(parseTicket("32=100=200").issues.map((i) => i.code)).toEqual(["UNREADABLE"]);
    expect(brief4("00=20=60=400=420=460=ໂຕ10ພ.ບ.ລ")).toEqual([
      "00T10000", "00B10000", "20T10000", "20B10000", "60T10000", "60B10000", "400T10000", "420T10000", "460T10000",
    ]);
  });
});

describe("ลัก (สะกดไทยไม่มี ห) = ຫລັກ", () => {
  test("11/51/91/=300 · ลัก1/5=300 · ลัก4/9=200 → เติมหลักร้อย 1 5 ตัวละ 300 · 4 9 ตัวละ 200", () => {
    const ticket = parseTicket("11/51/91/=300\nลัก1/5=300\nลัก4/9=200");
    expect(ticket.issues).toEqual([]);
    expect(ticket.bets.map((b) => `${b.number} ${b.amount}`)).toEqual([
      "11 300000", "51 300000", "91 300000",
      "111 300000", "151 300000", "191 300000", "511 300000", "551 300000", "591 300000",
      "411 200000", "451 200000", "491 200000", "911 200000", "951 200000", "991 200000",
    ]);
  });
});

describe("บาด (ບາດ พิมพ์ด้วยตัวไทย) = บาท", () => {
  const brief5 = (text: string) => parseTicket(text).bets.map((b) => `${b.number}${b.position[0]} ${b.currency} ${b.amount}`);

  test("บรรทัด บาด ท้ายโพย → ทั้งโพยเป็นบาท ไม่คูณ", () => {
    expect(brief5("07=50×50\n91=100×100\n915=20\nบาด")).toEqual([
      "07T THB 50", "07B THB 50", "91T THB 100", "91B THB 100", "915T THB 20",
    ]);
  });

  test("บาด ท้ายยอด → บาท", () => {
    expect(brief5("32=100บาด")).toEqual(["32T THB 100"]);
  });
});
