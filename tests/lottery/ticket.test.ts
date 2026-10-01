import { describe, expect, test } from "bun:test";

import { dateToIso, isoToDate, isoToDisplay, todayIso } from "@/lottery/date";
import { parseTicket } from "@/lottery/parser";
import { isTicketMessage, summarizeTicket } from "@/lottery/ticket";

describe("summarizeTicket", () => {
  test("อ่านได้ครบ → CONFIRMED นับยอดแยกกีบ/บาท", () => {
    const summary = summarizeTicket(parseTicket("32.72=300\n78=1000*1000฿"));
    expect(summary.status).toBe("CONFIRMED");
    expect(summary.betCount).toBe(4);
    expect(summary.totalLak).toBe(600_000);
    expect(summary.totalThb).toBe(2000);
  });

  test("มีบรรทัดที่อ่านไม่ออก → REVIEW ยังไม่นับยอดเลย", () => {
    const summary = summarizeTicket(parseTicket("32.72=300\n399"));
    expect(summary.status).toBe("REVIEW");
    expect(summary.bets).toEqual([]);
    expect(summary.totalLak).toBe(0);
    expect(summary.issues).toHaveLength(1);
  });

  test("force → นับเฉพาะบรรทัดที่อ่านได้ แต่ยังเก็บปัญหาไว้", () => {
    const summary = summarizeTicket(parseTicket("32.72=300\n399"), true);
    expect(summary.status).toBe("CONFIRMED");
    expect(summary.totalLak).toBe(600_000);
    expect(summary.issues).toHaveLength(1);
  });

  test("force แต่ไม่มีบรรทัดที่อ่านได้เลย → ยัง REVIEW", () => {
    expect(summarizeTicket(parseTicket("399"), true).status).toBe("REVIEW");
  });
});

describe("isTicketMessage", () => {
  test("ข้อความคุยทั่วไปและข้อความที่มีแต่ยอดรวมไม่ใช่โพย", () => {
    expect(isTicketMessage(parseTicket("ຂອບໃຈເດີ"))).toBe(false);
    expect(isTicketMessage(parseTicket("ລວມ150"))).toBe(false);
  });

  test("มีรายการแทง หรือมีบรรทัดตัวเลขที่อ่านไม่ออก = โพย", () => {
    expect(isTicketMessage(parseTicket("32=100"))).toBe(true);
    expect(isTicketMessage(parseTicket("399"))).toBe(true);
  });
});

describe("วันที่ของงวด", () => {
  test("วันนี้ตามเขตเวลาที่กำหนด ไม่ใช่ของเครื่อง", () => {
    // 17:30 UTC = 00:30 ของวันถัดไปที่เวียงจันทน์
    const now = new Date("2026-09-30T17:30:00.000Z");
    expect(todayIso("Asia/Vientiane", now)).toBe("2026-10-01");
    expect(todayIso("UTC", now)).toBe("2026-09-30");
  });

  test("แปลงไป-กลับกับคอลัมน์ @db.Date", () => {
    expect(isoToDate("2026-09-30").toISOString()).toBe("2026-09-30T00:00:00.000Z");
    expect(dateToIso(isoToDate("2026-09-30"))).toBe("2026-09-30");
    expect(isoToDisplay("2026-09-30")).toBe("30/09/2026");
  });
});
