/**
 * เลขนามสัตว์ (หวยลาว) — 40 สัตว์ ตัวละ 2–3 เลข: สัตว์ที่ n = n, n+40, n+80 (00 นับเป็น 100)
 *
 *   01 41 81 ปลาน้อย · 11 51 91 หมา · 20 60 00 ตะขาบ · 21 61 นางแอ่น · 40 80 นกอินทรี
 *
 * คนซื้อมักแทง "เต็มนาม" (ทุกเลขของสัตว์ตัวเดียว) — ใช้เดาเลขที่อ่านไม่ชัดได้:
 *   11 5? 91  →  11 51 91   (? ตัวเดียวที่ทำให้นามหมาครบ)
 */

/** เลข 2 ตัว → สัตว์ที่ 1–40 */
export const animalOf = (number: string) => ((Number(number) || 100) - 1) % 40 + 1;

/** ทุกเลขของสัตว์ตัวนั้น เช่น 11 → ["11", "51", "91"] · 20 → ["20", "60", "00"] */
export function animalNumbers(animal: number): string[] {
  return [animal, animal + 40, animal + 80].filter((n) => n <= 100).map((n) => String(n % 100).padStart(2, "0"));
}

/** เลข 2 ตัวที่มี ? ตัวเดียว (5? / ?1) — ไม่ติดกับตัวเลข/? อื่น */
const GUESS_TOKEN = /(?<![\d?])(?:\d\?|\?\d)(?![\d?])/g;
const TWO_DIGITS = /(?<![\d?])\d{2}(?![\d?])/g;
/** บรรทัดรอบ ๆ ที่ใช้เป็นบริบท — นามหนึ่งมีไม่เกิน 3 เลข เขียนบรรทัดละเลขก็ยังอยู่ในระยะ */
const CONTEXT_LINES = 2;

/** ส่วนเลขของบรรทัด (ก่อนยอด) — ไม่เอายอดมาปนเป็นบริบท */
const numberPart = (line: string) => line.split(/[=:;]/)[0]!;

/**
 * เติม ? ในเลข 2 ตัวด้วยเลขนามสัตว์: เลือกได้เมื่อมีตัวเลือกเดียวที่ทำให้นามของมันครบทุกเลข
 * จากเลขในบรรทัดเดียวกันและบรรทัดใกล้ ๆ — ไม่มี / มีหลายตัวเลือก = คง ? ไว้ให้คนตรวจตามเดิม
 */
export function fillAnimalGuesses(lines: readonly string[]): string[] {
  const numbersOf = lines.map((line) => numberPart(line).match(TWO_DIGITS) ?? []);
  return lines.map((line, index) => {
    const cut = numberPart(line).length;
    const context = new Set(numbersOf.slice(Math.max(0, index - CONTEXT_LINES), index + CONTEXT_LINES + 1).flat());
    return line.replace(GUESS_TOKEN, (token, offset: number) => {
      if (offset >= cut) return token;
      const candidates = [..."0123456789"]
        .map((digit) => token.replace("?", digit))
        .filter((guess) => animalNumbers(animalOf(guess)).every((n) => n === guess || context.has(n)));
      return candidates.length === 1 ? candidates[0]! : token;
    });
  });
}
