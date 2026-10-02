import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { imageToTicketText, type OcrBox, type OcrResult } from "@/lottery/image-text";
import { parseTicket } from "@/lottery/parser";

/**
 * เทสต์ตัวแปลงผล OCR → ข้อความโพย
 * fixtures/ocr/sample-*.json = ผลจริงของบริการ OCR (ocr/server.py) จากรูปโพยตัวอย่างของลูกค้า
 */
const fixture = async (n: number): Promise<OcrResult> =>
  Bun.file(join(import.meta.dir, "fixtures", "ocr", `sample-${n}.json`)).json();

/** กล่อง OCR ตามพิกัด ซ้าย/บน/ขวา/ล่าง */
const box = (text: string, left: number, top: number, right: number, bottom: number): OcrBox => ({
  text,
  score: 0.99,
  box: [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
  ],
});

const lines = (text: string) => text.split("\n").filter(Boolean);

describe("imageToTicketText — รูปแคปหน้าจอแชต", () => {
  test("ข้อความที่พิมพ์ตามรูปแบบแชตอยู่แล้ว ส่งต่อตรง ๆ และอ่านได้ครบ", async () => {
    const text = imageToTicketText(await fixture(6));

    expect(lines(text)).toEqual(["68=50*50", "86=50*50", "09=50*50", "90=50*50"]);
    expect(parseTicket(text).issues).toEqual([]);
  });

  test("ยอดรวม ລວມ อ่านจาก Tesseract และตรงกับยอดที่คิดได้", async () => {
    const text = imageToTicketText(await fixture(7));
    const parsed = parseTicket(text);

    expect(lines(text).at(-1)).toBe("ລວມ150");
    // คำ ລວມ150 ที่ PaddleOCR อ่านเป็นตัวละติน (a5u150) ต้องไม่หลุดมาเป็นบรรทัดที่อ่านไม่ออก
    expect(text).not.toContain("a5u150");
    expect(parsed.bets).toHaveLength(10);
    expect(parsed.declaredTotal).toBe(150);
    expect(parsed.issues).toEqual([]);
  });
});

describe("imageToTicketText — ลายมือ", () => {
  test("เลขกับยอดคนละกล่องบนแถวเดียวกัน → รวมเป็นรายการเดียว · ข้ามวันที่", async () => {
    const text = imageToTicketText(await fixture(1));

    expect(text).not.toContain("30.9.26");
    expect(lines(text)).toContain("515=5");
    expect(lines(text)).toContain("526=5");
  });

  test("คอลัมน์หัว B = บาท · ∝ / x = บน×ล่าง · เลขในกลุ่มที่โยงเส้นไว้ส่งเป็นเลขเปล่าให้คนเติมยอด", async () => {
    const text = imageToTicketText(await fixture(5));
    const all = lines(text);

    expect(all).toContain("49=300*300");
    expect(all).toContain("09=150*150");
    expect(all).toContain("547=70฿");
    // ":" ของลายมือที่ OCR อ่านเป็น ";" ก็แปลงและใส่ ฿ ตามหัวคอลัมน์เหมือนกัน
    expect(all).toContain("524=30฿");
    expect(all).toContain("430");
    // หัวกระดาษ (ບົນລ່າງ ที่อ่านเป็น Bo+0n) ไม่ใช่รายการ
    expect(text).not.toContain("Bo+0n");
  });

  test("เลขเปล่าไม่จับคู่กับต้นบรรทัดของคอลัมน์ถัดไป", async () => {
    const all = lines(imageToTicketText(await fixture(3)));

    expect(all).toContain("671");
    expect(all).toContain("447");
    expect(all.some((line) => line.startsWith("671="))).toBe(false);
  });

  test("อ่านเป็นคอลัมน์ ซ้าย→ขวา แต่ละคอลัมน์บน→ล่าง", () => {
    const text = imageToTicketText({
      paddle: [
        box("B", 210, 0, 240, 30),
        box("12-10", 0, 40, 100, 80),
        box("45.20", 200, 42, 300, 82),
        box("34:30", 4, 90, 104, 130),
        box("56-40", 196, 92, 296, 132),
      ],
      tesseract: [],
    });

    expect(text).toBe("12=10\n34=30\n\n45=20฿\n56=40฿");
  });

  test("ยอดที่ OCR อ่านเป็นกล่องแนวตั้งกล่องเดียว (555) → แยกเป็นยอดของแต่ละแถว", () => {
    const text = imageToTicketText({
      paddle: [
        box("26", 0, 0, 100, 50),
        box("66", 0, 60, 100, 110),
        box("515", 0, 120, 120, 170),
        box("555", 140, 0, 180, 170),
      ],
      tesseract: [],
    });

    expect(text).toBe("26=5\n66=5\n515=5");
  });

  test("ยอดที่ OCR อ่านเครื่องหมายคูณเป็น 0 (50050) → 50*50", () => {
    const text = imageToTicketText({ paddle: [box("32.50050", 0, 0, 200, 40)], tesseract: [] });

    expect(text).toBe("32=50*50");
  });

  test("กล่องที่อ่านไม่ออกส่งต่อตามที่อ่านได้ ไม่เดา", () => {
    const text = imageToTicketText({ paddle: [box("43240", 0, 0, 200, 40)], tesseract: [] });

    expect(text).toBe("43240");
    expect(parseTicket(text).issues).toHaveLength(1);
  });

  test("ไม่มีอะไรอ่านได้ → ข้อความว่าง", () => {
    expect(imageToTicketText({ paddle: [], tesseract: [] })).toBe("");
  });
});
