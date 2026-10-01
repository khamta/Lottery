/**
 * สถานะออนไลน์ของผู้ใช้ — client ส่ง heartbeat ทุก HEARTBEAT_MS ขณะเปิดแท็บอยู่
 * (`<PresenceHeartbeat />` ใน dashboard layout) แล้วเขียนเวลาลง `User.lastSeenAt`
 * ถือว่า "ออนไลน์" ถ้า heartbeat ล่าสุดยังไม่เกิน ONLINE_WINDOW_MS (เผื่อพลาดไป 1 รอบ)
 */
export const HEARTBEAT_MS = 60_000;
export const ONLINE_WINDOW_MS = 2 * HEARTBEAT_MS + 15_000;

/** เวลาที่เก่าที่สุดที่ยังนับว่าออนไลน์ — ใช้ใน where: { lastSeenAt: { gte: onlineSince() } } */
export function onlineSince(now: Date = new Date()) {
  return new Date(now.getTime() - ONLINE_WINDOW_MS);
}

export function isOnline(lastSeenAt: Date | string | null | undefined, now: Date = new Date()) {
  if (!lastSeenAt) return false;
  return new Date(lastSeenAt).getTime() >= onlineSince(now).getTime();
}
