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

const clockFormat = (timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

/** วันที่ YYYY-MM-DD + เวลา HH:mm ในเขตเวลา timeZone → Date (เวลาจริง UTC) */
export function zonedDateTime(iso: string, time: string, timeZone: string): Date {
  const guess = new Date(`${iso}T${time}:00.000Z`);
  const part = Object.fromEntries(clockFormat(timeZone).formatToParts(guess).map(({ type, value }) => [type, value]));
  // เวลาท้องถิ่นของ guess เทียบกับ guess = ส่วนต่างของเขตเวลา ณ ตอนนั้น
  const local = Date.UTC(+part.year!, +part.month! - 1, +part.day!, +part.hour!, +part.minute!);
  return new Date(guess.getTime() - (local - guess.getTime()));
}

/** Date → เวลา HH:mm ในเขตเวลา timeZone */
export function timeOf(value: Date, timeZone: string): string {
  const part = Object.fromEntries(clockFormat(timeZone).formatToParts(value).map(({ type, value }) => [type, value]));
  return `${part.hour}:${part.minute}`;
}
