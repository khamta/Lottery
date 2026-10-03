import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

/**
 * ที่เก็บไฟล์รูปโพย — รูปอยู่ในโฟลเดอร์ uploads ของโปรเจกต์ ฐานข้อมูลเก็บแค่ path (ticket_images.path)
 *
 *   uploads/tickets/<ปี-เดือน>/<uuid>.<นามสกุล>
 *
 * เว็บ (เสิร์ฟรูป) บอท (บันทึกรูป/ส่ง OCR) และ docker/migrate.ts (ย้ายรูปเก่าออกจากฐานข้อมูล) ใช้โฟลเดอร์เดียวกัน
 * docker: bind mount ./uploads → /app/uploads ทั้งสาม service (ดู docker-compose.yml)
 * ไม่วางไว้ใน public/ เพราะรูปโพยมีข้อมูลลูกค้า — เปิดได้ผ่าน /tickets/image/<id> ที่ตรวจสิทธิ์ก่อนเท่านั้น
 */
export const UPLOAD_ROOT = resolve(process.env.UPLOAD_DIR || "uploads");

const TICKET_DIR = "tickets";

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** path ในฐานข้อมูล → path จริงบนดิสก์ · path ที่หลุดออกนอกโฟลเดอร์ uploads (../) ไม่ยอม */
function absolutePath(path: string) {
  const full = resolve(UPLOAD_ROOT, path);
  if (!full.startsWith(UPLOAD_ROOT + sep)) throw new Error(`invalid upload path: ${path}`);
  return full;
}

/** บันทึกรูปโพยลงดิสก์ → path สำหรับเก็บในฐานข้อมูล (คั่นด้วย / เสมอ ไม่ขึ้นกับระบบปฏิบัติการ) */
export async function saveTicketImage(data: Uint8Array, mimeType: string, at = new Date()) {
  const month = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}`;
  const path = `${TICKET_DIR}/${month}/${randomUUID()}.${EXTENSIONS[mimeType] ?? "bin"}`;
  const full = absolutePath(path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, data);
  return path;
}

/** อ่านไฟล์รูป — ไม่มีไฟล์ = null (ถูกลบไปแล้ว / ไม่ได้ mount โฟลเดอร์) */
export async function readTicketImage(path: string): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    return new Uint8Array(await readFile(absolutePath(path)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function removeTicketImage(path: string) {
  await rm(absolutePath(path), { force: true });
}

/**
 * ลบไฟล์รูปที่ไม่มีแถวใน ticket_images แล้ว (โพยถูกลบ/รวม — แถวรูปหายตาม cascade แต่ไฟล์ยังอยู่)
 * ไฟล์ที่เพิ่งเขียนไม่เกิน graceMs ไม่แตะ — อาจเป็นรูปที่บอทกำลังบันทึกโพยอยู่
 * @param isUsed รับ path ทั้งหมดที่เจอ → path ที่ยังมีแถวในฐานข้อมูล
 */
export async function sweepTicketImages(
  isUsed: (paths: string[]) => Promise<Set<string>>,
  graceMs = 60 * 60 * 1000,
): Promise<number> {
  const root = join(UPLOAD_ROOT, TICKET_DIR);
  const entries = await readdir(root, { recursive: true, withFileTypes: true }).catch(() => []);
  const cutoff = Date.now() - graceMs;

  const candidates: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = join(entry.parentPath, entry.name);
    if ((await stat(full)).mtimeMs > cutoff) continue;
    candidates.push(relative(UPLOAD_ROOT, full).split(sep).join("/"));
  }

  let removed = 0;
  // ถามฐานข้อมูลทีละชุด ไม่ส่ง IN (...) ยาวเกินไป
  for (let i = 0; i < candidates.length; i += 500) {
    const batch = candidates.slice(i, i + 500);
    const used = await isUsed(batch);
    for (const path of batch) {
      if (used.has(path)) continue;
      await removeTicketImage(path);
      removed++;
    }
  }
  return removed;
}
