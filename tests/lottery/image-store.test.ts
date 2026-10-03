import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// โฟลเดอร์ uploads ชั่วคราว — ต้องตั้งก่อนโหลด image-store (UPLOAD_ROOT อ่านตอนโหลดโมดูล)
const root = await mkdtemp(join(tmpdir(), "uploads-"));
process.env.UPLOAD_DIR = root;
const { readTicketImage, removeTicketImage, saveTicketImage, sweepTicketImages, UPLOAD_ROOT } = await import(
  "@/lottery/image-store"
);

const bytes = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
const files = async () =>
  (await readdir(join(root, "tickets"), { recursive: true, withFileTypes: true }).catch(() => [])).filter((entry) =>
    entry.isFile(),
  );

/** ทำให้ไฟล์ดูเก่า — sweep ไม่แตะไฟล์ที่เพิ่งเขียน */
const age = (path: string, ms: number) => {
  const at = new Date(Date.now() - ms);
  return utimes(join(root, path), at, at);
};

beforeEach(() => rm(join(root, "tickets"), { recursive: true, force: true }));
afterAll(() => rm(root, { recursive: true, force: true }));

describe("ที่เก็บไฟล์รูปโพย", () => {
  test("บันทึกเป็นไฟล์แยกโฟลเดอร์ตามเดือน แล้วอ่านกลับได้ตรงทุกไบต์", async () => {
    expect(UPLOAD_ROOT).toBe(root);
    const path = await saveTicketImage(bytes, "image/jpeg", new Date(2026, 9, 2));

    expect(path).toMatch(/^tickets\/2026-10\/[0-9a-f-]{36}\.jpg$/);
    expect(await readTicketImage(path)).toEqual(bytes);
  });

  test("ชนิดไฟล์ที่ไม่รู้จักได้นามสกุล .bin · รูปเดียวกันสองครั้งได้คนละไฟล์", async () => {
    const first = await saveTicketImage(bytes, "image/heic");
    const second = await saveTicketImage(bytes, "image/heic");

    expect(first).toEndWith(".bin");
    expect(first).not.toBe(second);
  });

  test("ไม่มีไฟล์ = null · ลบไฟล์ที่ไม่มีอยู่แล้วไม่ error", async () => {
    const path = await saveTicketImage(bytes, "image/png");
    await removeTicketImage(path);

    expect(await readTicketImage(path)).toBeNull();
    await removeTicketImage(path);
  });

  test("path ที่หลุดออกนอกโฟลเดอร์ uploads ไม่ยอมอ่าน/ลบ", async () => {
    expect(readTicketImage("../secret.txt")).rejects.toThrow("invalid upload path");
    expect(removeTicketImage("tickets/../../secret.txt")).rejects.toThrow("invalid upload path");
  });

  test("sweep ลบเฉพาะไฟล์เก่าที่ไม่มีแถวในฐานข้อมูล — ไฟล์ที่ใช้อยู่และไฟล์ที่เพิ่งเขียนไม่แตะ", async () => {
    const used = await saveTicketImage(bytes, "image/jpeg");
    const orphan = await saveTicketImage(bytes, "image/jpeg");
    const fresh = await saveTicketImage(bytes, "image/jpeg");
    await age(used, 2 * 60 * 60 * 1000);
    await age(orphan, 2 * 60 * 60 * 1000);

    const asked: string[] = [];
    const removed = await sweepTicketImages(async (paths) => {
      asked.push(...paths);
      return new Set(paths.filter((path) => path === used));
    });

    expect(removed).toBe(1);
    expect(asked.sort()).toEqual([orphan, used].sort());
    expect(await readTicketImage(orphan)).toBeNull();
    expect(await readTicketImage(used)).toEqual(bytes);
    expect(await readTicketImage(fresh)).toEqual(bytes);
    expect(await files()).toHaveLength(2);
  });

  test("sweep ตอนยังไม่มีโฟลเดอร์รูปเลย = ไม่ทำอะไร", async () => {
    expect(await sweepTicketImages(async () => new Set())).toBe(0);
  });
});
