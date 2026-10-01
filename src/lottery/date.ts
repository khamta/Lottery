/** วันนี้ในเขตเวลาที่กำหนด รูปแบบ YYYY-MM-DD (ค่าที่ <input type="date"> ใช้) */
export function todayIso(timeZone: string, now = new Date()) {
  // en-CA ให้รูปแบบ YYYY-MM-DD ตรง ๆ
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** YYYY-MM-DD → Date เที่ยงคืน UTC (ตรงกับคอลัมน์ @db.Date ของ Prisma) */
export function isoToDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Date จากคอลัมน์ @db.Date → YYYY-MM-DD */
export function dateToIso(value: Date) {
  return value.toISOString().slice(0, 10);
}

/** YYYY-MM-DD → DD/MM/YYYY */
export function isoToDisplay(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
