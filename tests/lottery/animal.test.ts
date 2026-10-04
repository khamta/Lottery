import { describe, expect, test } from "bun:test";

import { animalNumbers, animalOf, fillAnimalGuesses } from "@/lottery/animal";
import { parseTicket } from "@/lottery/parser";

describe("เลขนามสัตว์", () => {
  test("สัตว์ที่ n = n, n+40, n+80 · 00 อยู่กับตะขาบ (20 60)", () => {
    expect(animalNumbers(animalOf("51"))).toEqual(["11", "51", "91"]);
    expect(animalNumbers(animalOf("00"))).toEqual(["20", "60", "00"]);
    expect(animalNumbers(animalOf("61"))).toEqual(["21", "61"]);
    expect(animalNumbers(animalOf("80"))).toEqual(["40", "80"]);
  });
});

describe("fillAnimalGuesses", () => {
  test("11 5? 91 → 51 (ทำให้นามหมาครบ)", () => {
    expect(fillAnimalGuesses(["11 5? 91=10"])).toEqual(["11 51 91=10"]);
    expect(fillAnimalGuesses(["11.?1.91=10"])).toEqual(["11.51.91=10"]);
  });

  test("เขียนบรรทัดละเลขก็เดาได้", () => {
    expect(fillAnimalGuesses(["11=5", "5?=5", "91=5"])).toEqual(["11=5", "51=5", "91=5"]);
    expect(fillAnimalGuesses(["21=5", "?1=5"])).toEqual(["21=5", "61=5"]);
  });

  test("นามไม่ครบ / ไม่มีบริบท / ? ในยอด = ไม่เดา", () => {
    expect(fillAnimalGuesses(["11 5?=10"])).toEqual(["11 5?=10"]); // ขาด 91
    expect(fillAnimalGuesses(["5?=10"])).toEqual(["5?=10"]);
    expect(fillAnimalGuesses(["11 51 91=1?"])).toEqual(["11 51 91=1?"]);
    expect(fillAnimalGuesses(["11=5", "x", "x", "5?=5", "91=5"])).toEqual(["11=5", "x", "x", "5?=5", "91=5"]); // 11 ไกลเกิน
  });
});

describe("parseTicket + เลขนามสัตว์", () => {
  test("โพยเต็มนามที่มี ? ตัวเดียว นับยอดได้เลย", () => {
    const ticket = parseTicket("11 5? 91=10");
    expect(ticket.bets.map((bet) => bet.number)).toEqual(["11", "51", "91"]);
    expect(ticket.needsReview).toBe(false);
  });
});
